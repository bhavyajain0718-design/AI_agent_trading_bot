import { Router, type IRouter } from "express";
import { db, onChainTradeEventsTable } from "@workspace/db";
import { eq, count, sum, desc, inArray, and } from "drizzle-orm";
import {
  GetChainStatusResponse,
  GetOnChainPnlResponse,
  ListOnChainTradesResponse,
} from "@workspace/api-zod";
import { checkRpcConnectivity } from "../lib/connectivity";
import { normalizeWalletAddress } from "../lib/trade-wallet";

const router: IRouter = Router();
const FINALIZED_PHASES = ["close", "settle"] as const;

router.get("/chain/status", async (_req, res): Promise<void> => {
  const contractAddress = process.env["CONTRACT_ADDRESS"] ?? null;
  const rpcUrl = process.env["RPC_URL"] ?? "http://127.0.0.1:8545";
  const network = process.env["CHAIN_NETWORK"] ?? "anvil-local";
  const rpcConnected = await checkRpcConnectivity(rpcUrl);

  const [stats] = await db
    .select({
      total: count(),
      totalPnl: sum(onChainTradeEventsTable.pnl),
    })
    .from(onChainTradeEventsTable)
    .where(inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES]));

  const status = {
    connected: rpcConnected,
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
  const requestedWallet = _req.query["walletAddress"] as string | undefined;
  const walletAddress = normalizeWalletAddress(requestedWallet);

  if (requestedWallet && !walletAddress) {
    res.status(400).json({ error: "Invalid walletAddress query parameter" });
    return;
  }

  const statsQuery = db
    .select({
      total: count(),
      totalPnl: sum(onChainTradeEventsTable.pnl),
    })
    .from(onChainTradeEventsTable);

  const latestQuery = db
    .select({ createdAt: onChainTradeEventsTable.createdAt })
    .from(onChainTradeEventsTable);

  const [stats] = walletAddress
    ? await statsQuery.where(and(
        eq(onChainTradeEventsTable.walletAddress, walletAddress),
        inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES]),
      ))
    : await statsQuery.where(inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES]));

  const [latest] = walletAddress
    ? await latestQuery.where(and(
        eq(onChainTradeEventsTable.walletAddress, walletAddress),
        inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES]),
      )).orderBy(desc(onChainTradeEventsTable.createdAt)).limit(1)
    : await latestQuery.where(inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES])).orderBy(desc(onChainTradeEventsTable.createdAt)).limit(1);

  const pnl = {
    totalPnl: stats?.totalPnl ?? "0",
    totalTrades: Number(stats?.total ?? 0),
    lastUpdated: latest?.createdAt?.toISOString() ?? null,
  };

  res.json(GetOnChainPnlResponse.parse(pnl));
});

router.get("/chain/on-chain-trades", async (req, res): Promise<void> => {
  const limit = Number(req.query["limit"] ?? 20);
  const requestedWallet = req.query["walletAddress"] as string | undefined;
  const walletAddress = normalizeWalletAddress(requestedWallet);

  if (requestedWallet && !walletAddress) {
    res.status(400).json({ error: "Invalid walletAddress query parameter" });
    return;
  }

  const eventsQuery = db
    .select()
    .from(onChainTradeEventsTable);

  const events = walletAddress
    ? await eventsQuery.where(and(
        eq(onChainTradeEventsTable.walletAddress, walletAddress),
        inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES]),
      )).orderBy(desc(onChainTradeEventsTable.createdAt)).limit(limit)
    : await eventsQuery.where(inArray(onChainTradeEventsTable.phase, [...FINALIZED_PHASES])).orderBy(desc(onChainTradeEventsTable.createdAt)).limit(limit);

  const mapped = events.map((event) => ({
    tradeId: event.tradeId,
    symbol: `${event.symbol} [${event.phase.toUpperCase()}]`,
    side: event.side,
    price: event.price ?? "0",
    pnl: event.pnl ?? "0",
    txHash: event.txHash,
    timestamp: event.createdAt.toISOString(),
  }));

  res.json(ListOnChainTradesResponse.parse(mapped));
});

export default router;
