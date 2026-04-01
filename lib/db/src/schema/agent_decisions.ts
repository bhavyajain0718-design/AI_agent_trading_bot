import { pgTable, text, serial, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentDecisionsTable = pgTable("agent_decisions", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address"),
  symbol: text("symbol").notNull(),
  action: text("action").notNull(),
  confidence: real("confidence").notNull(),
  price: text("price").notNull(),
  reasoning: text("reasoning").notNull(),
  indicators: text("indicators").notNull(),
  strategy: text("strategy").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentDecisionSchema = createInsertSchema(agentDecisionsTable).omit({ id: true, createdAt: true });
export type InsertAgentDecision = z.infer<typeof insertAgentDecisionSchema>;
export type AgentDecision = typeof agentDecisionsTable.$inferSelect;
