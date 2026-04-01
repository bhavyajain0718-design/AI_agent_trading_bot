import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, agentDecisionsTable } from "@workspace/db";
import { TRACKED_MARKETS, getAllMarketSnapshots, getMarketSnapshot } from "../lib/market-data";

const router: IRouter = Router();

router.get("/market/overview", async (req, res): Promise<void> => {
  const requestedSymbol =
    typeof req.query["symbol"] === "string" ? req.query["symbol"] : TRACKED_MARKETS[0].symbol;

  const [selectedMarketResult, allMarkets, recentDecisions] = await Promise.all([
    getMarketSnapshot(requestedSymbol).catch(() => null),
    getAllMarketSnapshots(),
    db
      .select()
      .from(agentDecisionsTable)
      .orderBy(desc(agentDecisionsTable.createdAt))
      .limit(25),
  ]);

  const selectedMarket =
    selectedMarketResult ??
    allMarkets.find((market) => market.symbol === requestedSymbol) ??
    allMarkets[0];

  if (!selectedMarket) {
    res.status(503).json({
      error: "No Kraken market data available for the configured symbols.",
      availableSymbols: TRACKED_MARKETS.map((market) => market.symbol),
    });
    return;
  }

  const latestDecisionBySymbol = new Map<string, (typeof recentDecisions)[number]>();
  for (const decision of recentDecisions) {
    if (!latestDecisionBySymbol.has(decision.symbol)) {
      latestDecisionBySymbol.set(decision.symbol, decision);
    }
  }

  res.json({
    generatedAt: new Date().toISOString(),
    selectedSymbol: selectedMarket.symbol,
    availableSymbols: TRACKED_MARKETS.map((market) => market.symbol),
    chart: {
      symbol: selectedMarket.symbol,
      timeframe: "1H",
      candles: selectedMarket.candles.map((candle: (typeof selectedMarket.candles)[number]) => ({
        time: new Date(candle.time * 1000).toISOString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
      latestPrice: selectedMarket.price,
      change24h: selectedMarket.change24h,
    },
    tickers: allMarkets.map((market: (typeof allMarkets)[number]) => ({
      symbol: market.symbol,
      price: market.price,
      change24h: market.change24h,
      action: market.decision.action,
      score: market.decision.score,
      confidence: market.decision.confidence,
      lastDecisionAt: latestDecisionBySymbol.get(market.symbol)?.createdAt?.toISOString() ?? null,
    })),
    signals: recentDecisions.slice(0, 10).map((decision: (typeof recentDecisions)[number]) => ({
      id: decision.id,
      symbol: decision.symbol,
      action: decision.action,
      confidence: decision.confidence,
      price: decision.price,
      reasoning: decision.reasoning,
      indicators: decision.indicators,
      createdAt: decision.createdAt.toISOString(),
    })),
  });
});

export default router;
