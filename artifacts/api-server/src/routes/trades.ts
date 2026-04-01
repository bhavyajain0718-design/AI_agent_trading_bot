import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, onChainTradeEventsTable, tradesTable } from "@workspace/db";
import {
  ListTradesResponse,
  GetTradeResponse,
  CreateTradeBody,
  SettleTradeBody,
  GetTradeParams,
  SettleTradeParams,
} from "@workspace/api-zod";
import { attachLivePnl } from "../lib/open-trade-pnl";
import { appendWalletToNotes, normalizeWalletAddress } from "../lib/trade-wallet";
import { recordTradeLifecycleOnChain } from "../lib/on-chain-ledger";

const router: IRouter = Router();

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
  const statusFilter = req.query["status"] as string | undefined;
  const requestedWallet = req.query["walletAddress"] as string | undefined;
  const walletAddress = normalizeWalletAddress(requestedWallet);
  const normalizedStatus = statusFilter?.toLowerCase();
  const validStatuses = new Set(["open", "closed", "settled"]);

  if (requestedWallet && !walletAddress) {
    res.status(400).json({ error: "Invalid walletAddress query parameter" });
    return;
  }

  if (normalizedStatus && normalizedStatus !== "all" && !validStatuses.has(normalizedStatus)) {
    res.status(400).json({ error: "Invalid status query parameter" });
    return;
  }

  const filters = [];
  if (symbol) {
    filters.push(eq(tradesTable.symbol, symbol));
  }
  if (walletAddress) {
    filters.push(eq(tradesTable.walletAddress, walletAddress));
  }
  if (normalizedStatus && normalizedStatus !== "all") {
    filters.push(eq(tradesTable.status, normalizedStatus));
  }

  const trades = await db
    .select()
    .from(tradesTable)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit);
  const tradeIds = trades.map((trade) => trade.id);
  const latestEvents = tradeIds.length > 0
    ? await db.select().from(onChainTradeEventsTable).orderBy(desc(onChainTradeEventsTable.createdAt))
    : [];
  const latestEventByTradeId = new Map<number, (typeof latestEvents)[number]>();

  for (const event of latestEvents) {
    if (!tradeIds.includes(event.tradeId) || latestEventByTradeId.has(event.tradeId)) {
      continue;
    }
    latestEventByTradeId.set(event.tradeId, event);
  }

  const enrichedTrades = await attachLivePnl(trades);
  const serialized = enrichedTrades.map((t) => ({
    ...t,
    chainTxHash: latestEventByTradeId.get(t.id)?.txHash ?? t.chainTxHash,
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
  const [latestEvent] = await db
    .select()
    .from(onChainTradeEventsTable)
    .where(eq(onChainTradeEventsTable.tradeId, trade.id))
    .orderBy(desc(onChainTradeEventsTable.createdAt))
    .limit(1);
  res.json(GetTradeResponse.parse({
    ...enrichedTrade,
    chainTxHash: latestEvent?.txHash ?? enrichedTrade.chainTxHash,
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
    const [latestLifecycleEvent] = await db
      .select()
      .from(onChainTradeEventsTable)
      .where(eq(onChainTradeEventsTable.tradeId, existing.id))
      .orderBy(desc(onChainTradeEventsTable.createdAt))
      .limit(1);

    if (existing.status === "closed" && latestLifecycleEvent && (latestLifecycleEvent.phase === "close" || latestLifecycleEvent.phase === "settle")) {
      chainTxHash = latestLifecycleEvent.txHash;
    } else {
      chainTxHash = await recordTradeLifecycleOnChain({
        tradeId: existing.id,
        phase: "settle",
        symbol: existing.symbol,
        side: existing.side,
        price: String(existing.price),
        quantity: String(existing.quantity),
        pnl: settlementPnl,
        walletAddress: body.data.walletAddress,
      });
    }
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Failed to record trade on-chain",
    });
    return;
  }

  const [updated] = await db
    .update(tradesTable)
    .set({
      walletAddress: body.data.walletAddress.toLowerCase(),
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
