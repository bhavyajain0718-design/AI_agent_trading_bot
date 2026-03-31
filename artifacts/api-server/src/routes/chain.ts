import { Router, type IRouter } from "express";
import { db, tradesTable } from "@workspace/db";
import { isNotNull, count, sum, desc } from "drizzle-orm";
import {
  GetChainStatusResponse,
  GetOnChainPnlResponse,
  ListOnChainTradesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/chain/status", async (_req, res): Promise<void> => {
  const contractAddress = process.env["CONTRACT_ADDRESS"] ?? null;
  const rpcUrl = process.env["RPC_URL"] ?? "http://127.0.0.1:8545";
  const network = process.env["CHAIN_NETWORK"] ?? "anvil-local";

  const [stats] = await db
    .select({
      total: count(),
      totalPnl: sum(tradesTable.pnl),
    })
    .from(tradesTable)
    .where(isNotNull(tradesTable.chainTxHash));

  const status = {
    connected: !!contractAddress,
    network,
    contractAddress,
    contractDeployed: !!contractAddress,
    rpcUrl,
    totalOnChainTrades: Number(stats?.total ?? 0),
    totalOnChainPnl: stats?.totalPnl ?? "0",
  };

  res.json(GetChainStatusResponse.parse(status));
});

router.get("/chain/on-chain-pnl", async (_req, res): Promise<void> => {
  const [stats] = await db
    .select({
      total: count(),
      totalPnl: sum(tradesTable.pnl),
    })
    .from(tradesTable)
    .where(isNotNull(tradesTable.chainTxHash));

  const [latest] = await db
    .select({ chainSettledAt: tradesTable.chainSettledAt })
    .from(tradesTable)
    .where(isNotNull(tradesTable.chainTxHash))
    .orderBy(desc(tradesTable.chainSettledAt))
    .limit(1);

  const pnl = {
    totalPnl: stats?.totalPnl ?? "0",
    totalTrades: Number(stats?.total ?? 0),
    lastUpdated: latest?.chainSettledAt?.toISOString() ?? null,
  };

  res.json(GetOnChainPnlResponse.parse(pnl));
});

router.get("/chain/on-chain-trades", async (req, res): Promise<void> => {
  const limit = Number(req.query["limit"] ?? 20);

  const trades = await db
    .select()
    .from(tradesTable)
    .where(isNotNull(tradesTable.chainTxHash))
    .orderBy(desc(tradesTable.chainSettledAt))
    .limit(limit);

  const mapped = trades.map((t) => ({
    tradeId: t.id,
    symbol: t.symbol,
    side: t.side,
    price: t.price ?? "0",
    pnl: t.pnl ?? "0",
    txHash: t.chainTxHash ?? "",
    timestamp: t.chainSettledAt?.toISOString() ?? t.createdAt.toISOString(),
  }));

  res.json(ListOnChainTradesResponse.parse(mapped));
});

export default router;
