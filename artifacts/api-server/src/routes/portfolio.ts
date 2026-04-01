import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  GetPortfolioSummaryResponse,
  GetPnlHistoryResponse,
} from "@workspace/api-zod";
import { calculateOpenPositionsPnl } from "../lib/open-trade-pnl";
import { normalizeWalletAddress } from "../lib/trade-wallet";

const router: IRouter = Router();

router.get("/portfolio/summary", async (req, res): Promise<void> => {
  const requestedWallet = req.query["walletAddress"] as string | undefined;
  const walletAddress = normalizeWalletAddress(requestedWallet);

  if (requestedWallet && !walletAddress) {
    res.status(400).json({ error: "Invalid walletAddress query parameter" });
    return;
  }

  if (walletAddress) {
    const walletTrades = await db.select().from(tradesTable).where(eq(tradesTable.walletAddress, walletAddress));
    const openTradePnl = await calculateOpenPositionsPnl(walletTrades.filter((trade) => trade.status === "open"));
    const realizedPnl = walletTrades
      .filter((trade) => trade.status !== "open")
      .reduce((sum, trade) => sum + Number(trade.pnl ?? "0"), 0);
    const pnlTrades = walletTrades.filter((trade) => trade.pnl !== null);
    const profitableTrades = pnlTrades.filter((trade) => Number(trade.pnl ?? "0") > 0);
    const topSymbolCounts = new Map<string, number>();

    for (const trade of walletTrades) {
      topSymbolCounts.set(trade.symbol, (topSymbolCounts.get(trade.symbol) ?? 0) + 1);
    }

    const topSymbol =
      [...topSymbolCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

    const summary = {
      totalValue: (10000 + realizedPnl + openTradePnl.totalUnrealizedPnl).toFixed(2),
      totalPnl: (realizedPnl + openTradePnl.totalUnrealizedPnl).toFixed(2),
      winRate: pnlTrades.length === 0 ? 0 : Number(((profitableTrades.length / pnlTrades.length) * 100).toFixed(1)),
      totalTrades: walletTrades.length,
      openTrades: walletTrades.filter((trade) => trade.status === "open").length,
      settledTrades: walletTrades.filter((trade) => trade.status === "settled").length,
      onChainSettled: walletTrades.filter((trade) => trade.chainTxHash !== null).length,
      topSymbol,
    };

    res.json(GetPortfolioSummaryResponse.parse(summary));
    return;
  }

  const [statsResult, openTrades] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int                                              AS "totalTrades",
        COUNT(*) FILTER (WHERE status = 'open')::int              AS "openTrades",
        COUNT(*) FILTER (WHERE status = 'settled')::int           AS "settledTrades",
        COUNT(*) FILTER (WHERE chain_tx_hash IS NOT NULL)::int    AS "onChainSettled",
        COALESCE(SUM(pnl), 0)::text                               AS "totalPnl",
        (
          CASE
            WHEN COUNT(*) FILTER (WHERE pnl IS NOT NULL) = 0 THEN 0
            ELSE ROUND(
              COUNT(*) FILTER (WHERE pnl::numeric > 0)::numeric /
              NULLIF(COUNT(*) FILTER (WHERE pnl IS NOT NULL), 0) * 100,
              1
            )
          END
        )::float                                                  AS "winRate",
        (
          SELECT symbol FROM trades
          GROUP BY symbol ORDER BY COUNT(*) DESC LIMIT 1
        )                                                         AS "topSymbol"
      FROM trades
    `),
    db.select({
      symbol: tradesTable.symbol,
      side: tradesTable.side,
      price: tradesTable.price,
      quantity: tradesTable.quantity,
      status: tradesTable.status,
      pnl: tradesTable.pnl,
    })
      .from(tradesTable)
      .where(eq(tradesTable.status, "open")),
  ]);

  const openPnl = await calculateOpenPositionsPnl(openTrades);
  const stats = (statsResult as { rows: unknown[] }).rows[0] as {
    totalTrades: number;
    openTrades: number;
    settledTrades: number;
    onChainSettled: number;
    totalPnl: string;
    winRate: number;
    topSymbol: string | null;
  };

  const summary = {
    totalValue: (10000 + Number(stats.totalPnl ?? "0") + openPnl.totalUnrealizedPnl).toFixed(2),
    totalPnl: (Number(stats.totalPnl ?? "0") + openPnl.totalUnrealizedPnl).toFixed(2),
    winRate: stats.winRate ?? 0,
    totalTrades: stats.totalTrades ?? 0,
    openTrades: stats.openTrades ?? 0,
    settledTrades: stats.settledTrades ?? 0,
    onChainSettled: stats.onChainSettled ?? 0,
    topSymbol: stats.topSymbol ?? null,
  };

  res.json(GetPortfolioSummaryResponse.parse(summary));
});

router.get("/portfolio/pnl", async (req, res): Promise<void> => {
  const requestedWallet = req.query["walletAddress"] as string | undefined;
  const walletAddress = normalizeWalletAddress(requestedWallet);

  if (requestedWallet && !walletAddress) {
    res.status(400).json({ error: "Invalid walletAddress query parameter" });
    return;
  }

  if (walletAddress) {
    const walletTrades = await db.select().from(tradesTable).where(eq(tradesTable.walletAddress, walletAddress));
    const dailyPnl = new Map<string, number>();
    const openTradePnl = await calculateOpenPositionsPnl(walletTrades.filter((trade) => trade.status === "open"));

    for (const trade of walletTrades) {
      if (trade.pnl === null || trade.status === "open") {
        continue;
      }

      const date = trade.createdAt.toISOString().slice(0, 10);
      dailyPnl.set(date, (dailyPnl.get(date) ?? 0) + Number(trade.pnl));
    }

    for (const position of openTradePnl.positionHistory) {
      dailyPnl.set(position.date, (dailyPnl.get(position.date) ?? 0) + position.pnl);
    }

    let cumulative = 0;
    const history = [...dailyPnl.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-60)
      .map(([date, pnl]) => {
        cumulative += pnl;
        return { date, pnl, cumulative };
      });

    res.json(GetPnlHistoryResponse.parse(history));
    return;
  }

  const [rows, openTrades] = await Promise.all([
    db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC')::text AS date,
        COALESCE(SUM(pnl::numeric), 0)::float     AS pnl
      FROM trades
      WHERE pnl IS NOT NULL
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
      LIMIT 60
    `),
    db.select({
      symbol: tradesTable.symbol,
      side: tradesTable.side,
      price: tradesTable.price,
      quantity: tradesTable.quantity,
      status: tradesTable.status,
      pnl: tradesTable.pnl,
    })
      .from(tradesTable)
      .where(eq(tradesTable.status, "open")),
  ]);

  const openPnl = await calculateOpenPositionsPnl(openTrades);
  const dailyPnl = new Map<string, number>();

  for (const row of (rows as { rows: unknown[] }).rows as { date: string; pnl: number }[]) {
    dailyPnl.set(row.date, Number(row.pnl));
  }

  for (const position of openPnl.positionHistory) {
    dailyPnl.set(position.date, (dailyPnl.get(position.date) ?? 0) + position.pnl);
  }

  let cumulative = 0;
  const history = [...dailyPnl.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-60)
    .map(([date, pnl]) => {
      cumulative += pnl;
      return { date, pnl, cumulative };
    });

  res.json(GetPnlHistoryResponse.parse(history));
});

export default router;
