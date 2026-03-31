import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  ListTradesResponse,
  GetTradeResponse,
  CreateTradeBody,
  SettleTradeBody,
  GetTradeParams,
  SettleTradeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  const serialized = trades.map((t) => ({
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

  res.json(GetTradeResponse.parse({
    ...trade,
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    chainSettledAt: trade.chainSettledAt?.toISOString() ?? null,
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

  const [updated] = await db
    .update(tradesTable)
    .set({
      pnl: body.data.pnl,
      chainTxHash: body.data.chainTxHash ?? null,
      chainSettledAt: new Date(),
      status: "settled",
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
