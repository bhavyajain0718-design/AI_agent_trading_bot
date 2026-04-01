import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ListTradesResponse,
  GetTradeResponse,
  CreateTradeBody,
  SettleTradeBody,
  GetTradeParams,
  SettleTradeParams,
} from "@workspace/api-zod";
import { attachLivePnl } from "../lib/open-trade-pnl";
import { appendWalletToNotes } from "../lib/trade-wallet";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

function toScaledInt(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return Math.round(numeric * 1e8).toString();
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

async function submitSettlementToChain(trade: {
  symbol: string;
  side: string;
  price: string;
  quantity: string;
}, pnl: string) {
  const rpcUrl = process.env["RPC_URL"];
  const contractAddress = process.env["CONTRACT_ADDRESS"];
  const privateKey = process.env["DEPLOYER_PRIVATE_KEY"];

  if (!rpcUrl || !contractAddress || !privateKey) {
    throw new Error("RPC_URL, CONTRACT_ADDRESS, and DEPLOYER_PRIVATE_KEY are required for on-chain settlement.");
  }

  const args = [
    "send",
    "--async",
    "--rpc-url",
    rpcUrl,
    "--private-key",
    normalizePrivateKey(privateKey),
    contractAddress,
    "recordTrade(string,string,int256,int256,int256)",
    trade.symbol,
    trade.side,
    toScaledInt(trade.price),
    toScaledInt(trade.quantity),
    toScaledInt(pnl),
  ];

  const { stdout } = await execFileAsync("cast", args, {
    cwd: process.cwd(),
    env: process.env,
  });

  const txHash = stdout.trim().split(/\s+/).find((part) => /^0x[a-fA-F0-9]{64}$/.test(part));
  if (!txHash) {
    throw new Error(`Unable to parse transaction hash from cast send output: ${stdout}`);
  }

  return txHash;
}

async function resolveSettlementPnl(trade: typeof tradesTable.$inferSelect) {
  if (trade.status === "open") {
    const [enrichedTrade] = await attachLivePnl([trade]);
    if (typeof enrichedTrade?.pnl === "string" && Number.isFinite(Number(enrichedTrade.pnl))) {
      return Number(enrichedTrade.pnl).toFixed(8);
    }
  }

  if (typeof trade.pnl === "string" && Number.isFinite(Number(trade.pnl))) {
    return Number(trade.pnl).toFixed(8);
  }

  return "0.00000000";
}

router.get("/trades", async (req, res): Promise<void> => {
  const limit = Number(req.query["limit"] ?? 50);
  const symbol = req.query["symbol"] as string | undefined;

  let query = db.select().from(tradesTable).orderBy(desc(tradesTable.createdAt));
  if (symbol) {
    query = db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.symbol, symbol))
      .orderBy(desc(tradesTable.createdAt)) as typeof query;
  }

  const trades = await query.limit(limit);
  const enrichedTrades = await attachLivePnl(trades);
  const serialized = enrichedTrades.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    chainSettledAt: t.chainSettledAt?.toISOString() ?? null,
  }));
  res.json(ListTradesResponse.parse(serialized));
});

router.post("/trades", async (req, res): Promise<void> => {
  const parsed = CreateTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [trade] = await db
    .insert(tradesTable)
    .values({
      ...parsed.data,
      status: "open",
    })
    .returning();

  res.status(201).json(GetTradeResponse.parse({
    ...trade,
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    chainSettledAt: trade.chainSettledAt?.toISOString() ?? null,
  }));
});

router.get("/trades/:id", async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.id, params.data.id));

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const [enrichedTrade] = await attachLivePnl([trade]);
  res.json(GetTradeResponse.parse({
    ...enrichedTrade,
    createdAt: enrichedTrade.createdAt.toISOString(),
    updatedAt: enrichedTrade.updatedAt.toISOString(),
    chainSettledAt: enrichedTrade.chainSettledAt?.toISOString() ?? null,
  }));
});

router.post("/trades/:id/settle", async (req, res): Promise<void> => {
  const params = SettleTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SettleTradeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(tradesTable)
    .where(eq(tradesTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  if (existing.status === "settled") {
    res.status(409).json({ error: "Trade already settled" });
    return;
  }

  const settlementPnl = await resolveSettlementPnl(existing);

  let chainTxHash: string;
  try {
    chainTxHash = await submitSettlementToChain(
      {
        symbol: existing.symbol,
        side: existing.side,
        price: String(existing.price),
        quantity: String(existing.quantity),
      },
      settlementPnl,
    );
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Failed to record trade on-chain",
    });
    return;
  }

  const [updated] = await db
    .update(tradesTable)
    .set({
      pnl: settlementPnl,
      chainTxHash,
      chainSettledAt: new Date(),
      status: "settled",
      notes: appendWalletToNotes(existing.notes, body.data.walletAddress),
    })
    .where(eq(tradesTable.id, params.data.id))
    .returning();

  res.json(GetTradeResponse.parse({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    chainSettledAt: updated.chainSettledAt?.toISOString() ?? null,
  }));
});

export default router;
