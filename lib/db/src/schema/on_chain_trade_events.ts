import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const onChainTradeEventsTable = pgTable("on_chain_trade_events", {
  id: serial("id").primaryKey(),
  tradeId: integer("trade_id").notNull(),
  phase: text("phase").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  pnl: numeric("pnl", { precision: 20, scale: 8 }).notNull().default("0"),
  walletAddress: text("wallet_address"),
  txHash: text("tx_hash").notNull(),
  network: text("network").notNull().default("sepolia"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOnChainTradeEventSchema = createInsertSchema(onChainTradeEventsTable).omit({ id: true, createdAt: true });
export type InsertOnChainTradeEvent = z.infer<typeof insertOnChainTradeEventSchema>;
export type OnChainTradeEvent = typeof onChainTradeEventsTable.$inferSelect;
