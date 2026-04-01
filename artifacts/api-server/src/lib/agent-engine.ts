import { and, desc, eq, gt } from "drizzle-orm";
import { db, agentDecisionsTable, tradesTable } from "@workspace/db";
import { logger } from "./logger";
import {
  TRACKED_MARKETS,
  type MarketTimeframeKey,
  getMarketSnapshot,
  normalizeTimeframe,
} from "./market-data";
import { appendWalletToNotes, getTradeWalletAddress, normalizeWalletAddress } from "./trade-wallet";
import { recordTradeLifecycleOnChain } from "./on-chain-ledger";

type AgentRuntimeState = "running" | "paused" | "stopped";

const LOOP_INTERVAL_MS = Number(process.env.AGENT_LOOP_INTERVAL_MS ?? "10000");
const EXECUTION_CONFIDENCE_THRESHOLD = Number(process.env.EXECUTION_CONFIDENCE_THRESHOLD ?? "0.6");
const DEFAULT_NOTIONAL_USD = Number(process.env.PAPER_TRADE_NOTIONAL_USD ?? "250");
const DEFAULT_COOLDOWN_MINUTES = Number(process.env.TRADE_COOLDOWN_MINUTES ?? "30");
const STRATEGY_NAME = "kraken-confluence-v1";

class AgentEngine {
  private state: AgentRuntimeState = "stopped";
  private timeframe: MarketTimeframeKey = normalizeTimeframe(process.env.AGENT_TIMEFRAME);
  private startedAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastRunAt: number | null = null;
  private lastError: string | null = null;
  private cycleInFlight = false;
  private krakenConnected = false;
  private activeWalletAddress: string | null = null;

  getStatus() {
    return {
      status: this.state,
      strategy: STRATEGY_NAME,
      timeframe: this.timeframe,
      uptime:
        this.state === "running" && this.startedAt !== null
          ? Math.floor((Date.now() - this.startedAt) / 1000)
          : 0,
      krakenConnected: this.krakenConnected,
      activeWalletAddress: this.activeWalletAddress,
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
      this.activeWalletAddress = null;
    }
  }

  setTimeframe(nextTimeframe: string | undefined) {
    this.timeframe = normalizeTimeframe(nextTimeframe);
  }

  setActiveWalletAddress(walletAddress: string | undefined) {
    this.activeWalletAddress = normalizeWalletAddress(walletAddress) ?? null;
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
    const snapshot = await getMarketSnapshot(symbol, this.timeframe);
    let executionReason = "Signal logged only.";

    if (!snapshot.decision.executed || snapshot.decision.confidence < EXECUTION_CONFIDENCE_THRESHOLD) {
      executionReason = "Execution skipped: confidence below threshold.";
      await this.logDecision(snapshot, executionReason);
      return;
    }

    const side = snapshot.decision.action;
    if (side !== "buy" && side !== "sell") {
      executionReason = "Execution skipped: action is not a tradeable buy/sell signal.";
      await this.logDecision(snapshot, executionReason);
      return;
    }

    await this.closeOpposingTrades(snapshot.symbol, side, snapshot.price);

    if (await this.hasOpenPosition(snapshot.symbol, side)) {
      executionReason = `Execution skipped: an open ${side.toUpperCase()} position already exists for ${snapshot.symbol}.`;
      await this.logDecision(snapshot, executionReason);
      return;
    }

    if (await this.isCoolingDown(snapshot.symbol, side)) {
      executionReason = `Execution skipped: ${snapshot.symbol} is still inside the ${DEFAULT_COOLDOWN_MINUTES} minute cooldown window.`;
      await this.logDecision(snapshot, executionReason);
      return;
    }

    const quantity = DEFAULT_NOTIONAL_USD / snapshot.price;
    const tradeWalletAddress = this.activeWalletAddress;
    try {
      const [trade] = await db.insert(tradesTable).values({
        walletAddress: tradeWalletAddress,
        symbol: snapshot.symbol,
        side,
        price: snapshot.price.toFixed(8),
        quantity: quantity.toFixed(8),
        strategy: STRATEGY_NAME,
        confidence: snapshot.decision.confidence,
        status: "open",
        notes: appendWalletToNotes(
          `${snapshot.decision.signalLabel} score=${snapshot.decision.score} conf=${(snapshot.decision.confidence * 100).toFixed(0)}%`,
          tradeWalletAddress,
        ),
      }).returning();

      const txHash = await recordTradeLifecycleOnChain({
        tradeId: trade.id,
        phase: "open",
        symbol: trade.symbol,
        side: trade.side,
        price: String(trade.price),
        quantity: String(trade.quantity),
        pnl: "0",
        walletAddress: tradeWalletAddress,
      });
      await db
        .update(tradesTable)
        .set({ chainTxHash: txHash })
        .where(eq(tradesTable.id, trade.id));
      executionReason = `Execution sent on-chain: opened trade #${trade.id} with tx ${txHash.slice(0, 10)}...`;
    } catch (error) {
      logger.error({ err: error, symbol: snapshot.symbol }, "Failed to open trade from agent signal");
      executionReason = error instanceof Error
        ? `Execution failed: ${error.message}`
        : "Execution failed: unknown error while opening the trade.";
    }

    await this.logDecision(snapshot, executionReason);
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

  private async closeOpposingTrades(symbol: string, nextSide: "buy" | "sell", marketPrice: number) {
    const opposingSide = nextSide === "buy" ? "sell" : "buy";

    const openOpposingTrades = await db
      .select()
      .from(tradesTable)
      .where(
        and(
          eq(tradesTable.symbol, symbol),
          eq(tradesTable.status, "open"),
          eq(tradesTable.side, opposingSide),
        ),
      )
      .orderBy(desc(tradesTable.createdAt));

    for (const trade of openOpposingTrades) {
      const tradeWalletAddress = trade.walletAddress ?? getTradeWalletAddress(trade.notes) ?? this.activeWalletAddress;
      const entryPrice = Number(trade.price);
      const quantity = Number(trade.quantity);

      if (!Number.isFinite(entryPrice) || !Number.isFinite(quantity)) {
        continue;
      }

      const pnl =
        trade.side === "buy"
          ? (marketPrice - entryPrice) * quantity
          : (entryPrice - marketPrice) * quantity;
      const nextNotes = trade.notes
        ? `${trade.notes} | auto-closed @ ${marketPrice.toFixed(4)}`
        : `auto-closed @ ${marketPrice.toFixed(4)}`;

      const pnlText = pnl.toFixed(8);
      const txHash = await recordTradeLifecycleOnChain({
        tradeId: trade.id,
        phase: "close",
        symbol: trade.symbol,
        side: trade.side,
        price: marketPrice.toFixed(8),
        quantity: String(trade.quantity),
        pnl: pnlText,
        walletAddress: tradeWalletAddress,
      });

      await db
        .update(tradesTable)
        .set({
          pnl: pnlText,
          status: "settled",
          chainTxHash: txHash,
          chainSettledAt: new Date(),
          notes: appendWalletToNotes(nextNotes, tradeWalletAddress),
        })
        .where(eq(tradesTable.id, trade.id));
    }
  }

  private async hasOpenPosition(symbol: string, side: "buy" | "sell") {
    const [existingOpenTrade] = await db
      .select()
      .from(tradesTable)
      .where(
        and(
          eq(tradesTable.symbol, symbol),
          eq(tradesTable.status, "open"),
          eq(tradesTable.side, side),
        ),
      )
      .orderBy(desc(tradesTable.createdAt))
      .limit(1);

    return Boolean(existingOpenTrade);
  }

  private async logDecision(snapshot: Awaited<ReturnType<typeof getMarketSnapshot>>, executionReason: string) {
    await db.insert(agentDecisionsTable).values({
      walletAddress: this.activeWalletAddress,
      symbol: snapshot.symbol,
      action: snapshot.decision.action,
      confidence: snapshot.decision.confidence,
      price: snapshot.price.toFixed(2),
      reasoning: `${snapshot.decision.reasoning} Execution: ${executionReason}`,
      indicators: snapshot.decision.indicators,
      strategy: STRATEGY_NAME,
    });
  }
}

export const agentEngine = new AgentEngine();
