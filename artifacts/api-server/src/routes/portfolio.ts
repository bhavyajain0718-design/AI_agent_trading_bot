import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, onChainTradeEventsTable, tradesTable } from "@workspace/db";
import {
  GetPortfolioSummaryResponse,
  GetPnlHistoryResponse,
} from "@workspace/api-zod";
import { calculateOpenPositionsPnl } from "../lib/open-trade-pnl";
import { normalizeWalletAddress } from "../lib/trade-wallet";

const router: IRouter = Router();
const FINALIZED_PHASES = ["close", "settle"] as const;

function getHourBucket(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.toISOString().slice(0, 13)}:00:00.000Z`;
}

router.get("/portfolio/summary", async (req, res): Promise<void> => {
  const requestedWallet = req.query["walletAddress"] as string | undefined;
  const walletAddress = normalizeWalletAddress(requestedWallet);

  if (requestedWallet && !walletAddress) {
    res.status(400).json({ error: "Invalid walletAddress query parameter" });
    return;
  }

  if (walletAddress) {
    const walletTrades = await db.select().from(tradesTable).where(eq(tradesTable.walletAddress, walletAddress));
    const finalizedEvents = await db
      .select({
        tradeId: onChainTradeEventsTable.tradeId,
        pnl: onChainTradeEventsTable.pnl,
      })
      .from(onChainTradeEventsTable)
      .where(and(
        eq(onChainTradeEventsTable.walletAddress, walletAddress),
        inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES]),
      ));
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
    const finalizedTradeIds = new Set(finalizedEvents.map((event) => event.tradeId));

    const summary = {
      totalValue: (10000 + realizedPnl + openTradePnl.totalUnrealizedPnl).toFixed(2),
      totalPnl: (realizedPnl + openTradePnl.totalUnrealizedPnl).toFixed(2),
      winRate: pnlTrades.length === 0 ? 0 : Number(((profitableTrades.length / pnlTrades.length) * 100).toFixed(1)),
      totalTrades: walletTrades.length,
      openTrades: walletTrades.filter((trade) => trade.status === "open").length,
      settledTrades: finalizedTradeIds.size,
      onChainSettled: finalizedTradeIds.size,
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
    const hourlyPnl = new Map<string, number>();
    const openTradePnl = await calculateOpenPositionsPnl(walletTrades.filter((trade) => trade.status === "open"));

    for (const trade of walletTrades) {
      if (trade.pnl === null || trade.status === "open") {
        continue;
      }

      const bucket = getHourBucket(trade.createdAt);
      hourlyPnl.set(bucket, (hourlyPnl.get(bucket) ?? 0) + Number(trade.pnl));
    }

    for (const position of openTradePnl.positionHistory) {
      const bucket = getHourBucket(position.date);
      hourlyPnl.set(bucket, (hourlyPnl.get(bucket) ?? 0) + position.pnl);
    }

    let cumulative = 0;
    const history = [...hourlyPnl.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-72)
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
        TO_CHAR(DATE_TRUNC('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:00:00.000"Z"') AS date,
        COALESCE(SUM(pnl::numeric), 0)::float     AS pnl
      FROM trades
      WHERE pnl IS NOT NULL
      GROUP BY DATE_TRUNC('hour', created_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
      LIMIT 72
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
  const hourlyPnl = new Map<string, number>();

  for (const row of (rows as { rows: unknown[] }).rows as { date: string; pnl: number }[]) {
    hourlyPnl.set(row.date, Number(row.pnl));
  }

  for (const position of openPnl.positionHistory) {
    const bucket = getHourBucket(position.date);
    hourlyPnl.set(bucket, (hourlyPnl.get(bucket) ?? 0) + position.pnl);
  }

  let cumulative = 0;
  const history = [...hourlyPnl.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-72)
    .map(([date, pnl]) => {
      cumulative += pnl;
      return { date, pnl, cumulative };
    });

  res.json(GetPnlHistoryResponse.parse(history));
});

export default router;
