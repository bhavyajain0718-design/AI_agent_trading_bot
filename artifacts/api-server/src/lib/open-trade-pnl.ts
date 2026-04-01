import { getLiveMarketPrice, normalizeTimeframe } from "./market-data";
import { agentEngine } from "./agent-engine";

type TradeLike = {
  symbol: string;
  side: string;
  price: string | number;
  quantity: string | number;
  status: string;
  pnl?: string | null;
};

function calculateTradePnl(trade: TradeLike, currentPrice: number) {
  const entryPrice = Number(trade.price);
  const quantity = Number(trade.quantity);

  if (!Number.isFinite(entryPrice) || !Number.isFinite(quantity)) {
    return null;
  }

  const pnl =
    trade.side === "buy"
      ? (currentPrice - entryPrice) * quantity
      : (entryPrice - currentPrice) * quantity;

  return pnl;
}

export async function getLivePricesForSymbols(symbols: string[]) {
  const timeframe = normalizeTimeframe(agentEngine.getStatus().timeframe);
  const uniqueSymbols = [...new Set(symbols)];

  const snapshots = await Promise.allSettled(
    uniqueSymbols.map((symbol) => getLiveMarketPrice(symbol, timeframe)),
  );

  const priceBySymbol = new Map<string, number>();
  for (const [index, snapshot] of snapshots.entries()) {
    if (snapshot.status === "fulfilled") {
      priceBySymbol.set(uniqueSymbols[index], snapshot.value);
    }
  }

  return priceBySymbol;
}

export async function attachLivePnl<T extends TradeLike>(trades: T[]) {
  const priceBySymbol = await getLivePricesForSymbols(trades.map((trade) => trade.symbol));

  return trades.map((trade) => {
    if (trade.status !== "open") {
      return trade;
    }

    const currentPrice = priceBySymbol.get(trade.symbol);
    if (!Number.isFinite(currentPrice)) {
      return trade;
    }

    const pnl = calculateTradePnl(trade, currentPrice);
    if (pnl === null) {
      return trade;
    }

    return {
      ...trade,
      pnl: pnl.toFixed(8),
    };
  });
}

export async function calculateOpenPositionsPnl(trades: TradeLike[]) {
  const today = new Date().toISOString().slice(0, 10);
  const enrichedTrades = await attachLivePnl(trades);

  const positionHistory = enrichedTrades
    .filter((trade) => trade.status === "open")
    .map((trade) => ({
      date: today,
      pnl: Number(trade.pnl ?? "0"),
    }));

  return {
    totalUnrealizedPnl: positionHistory.reduce((sum, position) => sum + position.pnl, 0),
    positionHistory,
  };
}
