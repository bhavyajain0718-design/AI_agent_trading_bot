import { pgTable, text, serial, timestamp, numeric, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address"),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  price: numeric("price", { precision: 20, scale: 8 }).notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  pnl: numeric("pnl", { precision: 20, scale: 8 }),
  strategy: text("strategy").notNull().default("momentum"),
  confidence: real("confidence"),
  status: text("status").notNull().default("pending"),
  chainTxHash: text("chain_tx_hash"),
  chainSettledAt: timestamp("chain_settled_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
