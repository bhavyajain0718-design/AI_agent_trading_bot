import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  GetPortfolioSummaryResponse,
  GetPnlHistoryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/portfolio/summary", async (_req, res): Promise<void> => {
  const statsResult = await db.execute(sql`
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
  `);

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
    totalValue: "10000.00",
    totalPnl: stats.totalPnl ?? "0",
    winRate: stats.winRate ?? 0,
    totalTrades: stats.totalTrades ?? 0,
    openTrades: stats.openTrades ?? 0,
    settledTrades: stats.settledTrades ?? 0,
    onChainSettled: stats.onChainSettled ?? 0,
    topSymbol: stats.topSymbol ?? null,
  };

  res.json(GetPortfolioSummaryResponse.parse(summary));
});

router.get("/portfolio/pnl", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT
      DATE(created_at AT TIME ZONE 'UTC')::text AS date,
      COALESCE(SUM(pnl::numeric), 0)::float     AS pnl
    FROM trades
    WHERE pnl IS NOT NULL
    GROUP BY DATE(created_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
    LIMIT 60
  `);

  let cumulative = 0;
  const history = ((rows as { rows: unknown[] }).rows as { date: string; pnl: number }[]).map((row) => {
    cumulative += Number(row.pnl);
    return { date: row.date, pnl: Number(row.pnl), cumulative };
  });

  res.json(GetPnlHistoryResponse.parse(history));
});

export default router;
