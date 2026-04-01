import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function bootstrapDatabase() {
  await db.execute(sql`
    ALTER TABLE trades
    ADD COLUMN IF NOT EXISTS wallet_address text
  `);

  await db.execute(sql`
    ALTER TABLE agent_decisions
    ADD COLUMN IF NOT EXISTS wallet_address text
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS on_chain_trade_events (
      id serial PRIMARY KEY,
      trade_id integer NOT NULL,
      phase text NOT NULL,
      symbol text NOT NULL,
      side text NOT NULL,
      price numeric(20, 8) NOT NULL,
      quantity numeric(20, 8) NOT NULL,
      pnl numeric(20, 8) NOT NULL DEFAULT 0,
      wallet_address text,
      tx_hash text NOT NULL,
      network text NOT NULL DEFAULT 'sepolia',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    UPDATE trades
    SET wallet_address = LOWER(SUBSTRING(notes FROM 'wallet=(0x[a-fA-F0-9]{40})'))
    WHERE wallet_address IS NULL
      AND notes ~ 'wallet=(0x[a-fA-F0-9]{40})'
  `);
}
