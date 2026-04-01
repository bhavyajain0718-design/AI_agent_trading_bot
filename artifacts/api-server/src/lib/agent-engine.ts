import { and, desc, eq, gt } from "drizzle-orm";
import { db, agentDecisionsTable, tradesTable } from "@workspace/db";
import { logger } from "./logger";
import { TRACKED_MARKETS, getMarketSnapshot } from "./market-data";

type AgentRuntimeState = "running" | "paused" | "stopped";

const LOOP_INTERVAL_MS = 30_000;
const EXECUTION_CONFIDENCE_THRESHOLD = 0.65;
const DEFAULT_NOTIONAL_USD = Number(process.env.PAPER_TRADE_NOTIONAL_USD ?? "250");
const DEFAULT_COOLDOWN_MINUTES = Number(process.env.TRADE_COOLDOWN_MINUTES ?? "30");
const STRATEGY_NAME = "kraken-confluence-v1";

class AgentEngine {
  private state: AgentRuntimeState = "stopped";
  private startedAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastRunAt: number | null = null;
  private lastError: string | null = null;
  private cycleInFlight = false;
  private krakenConnected = false;

  getStatus() {
    return {
      status: this.state,
      strategy: STRATEGY_NAME,
      uptime:
        this.state === "running" && this.startedAt !== null
          ? Math.floor((Date.now() - this.startedAt) / 1000)
          : 0,
      krakenConnected: this.krakenConnected,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
    };
  }

  setState(nextState: AgentRuntimeState) {
    const previousState = this.state;
    this.state = nextState;

    if (nextState === "running" && previousState !== "running") {
      this.startedAt = Date.now();
      this.scheduleNextRun(0);
    }

    if (nextState === "paused") {
      this.clearTimer();
    }

    if (nextState === "stopped") {
      this.clearTimer();
      this.startedAt = null;
      this.lastRunAt = null;
      this.lastError = null;
    }
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextRun(delayMs = LOOP_INTERVAL_MS) {
    this.clearTimer();
    if (this.state !== "running") {
      return;
    }

    this.timer = setTimeout(() => {
      void this.runCycle();
    }, delayMs);
  }

  async runCycle() {
    if (this.state !== "running" || this.cycleInFlight) {
      return;
    }

    this.cycleInFlight = true;
    this.lastRunAt = Date.now();

    try {
      await Promise.all(TRACKED_MARKETS.map((market) => this.processMarket(market.symbol)));
      this.krakenConnected = true;
      this.lastError = null;
    } catch (error) {
      this.krakenConnected = false;
      this.lastError = error instanceof Error ? error.message : "Unknown agent loop error";
      logger.error({ err: error }, "Agent cycle failed");
    } finally {
      this.cycleInFlight = false;
      this.scheduleNextRun();
    }
  }

  private async processMarket(symbol: string) {
    const snapshot = await getMarketSnapshot(symbol);

    await db.insert(agentDecisionsTable).values({
      symbol: snapshot.symbol,
      action: snapshot.decision.action,
      confidence: snapshot.decision.confidence,
      price: snapshot.price.toFixed(2),
      reasoning: snapshot.decision.reasoning,
      indicators: snapshot.decision.indicators,
      strategy: STRATEGY_NAME,
    });

    if (!snapshot.decision.executed || snapshot.decision.confidence <= EXECUTION_CONFIDENCE_THRESHOLD) {
      return;
    }

    const side = snapshot.decision.action;
    if (side !== "buy" && side !== "sell") {
      return;
    }

    if (await this.isCoolingDown(snapshot.symbol, side)) {
      return;
    }

    const quantity = DEFAULT_NOTIONAL_USD / snapshot.price;
    await db.insert(tradesTable).values({
      symbol: snapshot.symbol,
      side,
      price: snapshot.price.toFixed(8),
      quantity: quantity.toFixed(8),
      strategy: STRATEGY_NAME,
      confidence: snapshot.decision.confidence,
      status: "open",
      notes: `${snapshot.decision.signalLabel} score=${snapshot.decision.score} conf=${(snapshot.decision.confidence * 100).toFixed(0)}%`,
    });
  }

  private async isCoolingDown(symbol: string, side: "buy" | "sell") {
    const cooldownFloor = new Date(Date.now() - DEFAULT_COOLDOWN_MINUTES * 60_000);
    const [recentTrade] = await db
      .select()
      .from(tradesTable)
      .where(
        and(
          eq(tradesTable.symbol, symbol),
          eq(tradesTable.side, side),
          gt(tradesTable.createdAt, cooldownFloor),
        ),
      )
      .orderBy(desc(tradesTable.createdAt))
      .limit(1);

    return Boolean(recentTrade);
  }
}

export const agentEngine = new AgentEngine();
