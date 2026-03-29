"""
agent/trading_agent.py
Main orchestrator — ties together Kraken data, AI brain, strategies,
risk manager, and on-chain trust layer into one autonomous agent loop.
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional

from config import (
    KRAKEN_API_KEY, KRAKEN_API_SECRET, KRAKEN_CLI_PATH,
    ANTHROPIC_API_KEY, TRADING_PAIRS,
    MAX_POSITION_USD, MAX_DAILY_LOSS_USD, MAX_DRAWDOWN_PCT,
    RISK_PER_TRADE_PCT, MIN_CONFIDENCE, LOOP_INTERVAL_SEC,
    PAPER_TRADING, STARTING_CAPITAL_USD,
    AGENT_WALLET_ADDRESS, AGENT_PRIVATE_KEY, RPC_URL, CHAIN_ID,
    IDENTITY_REGISTRY_ADDR, REPUTATION_REGISTRY_ADDR, VALIDATION_REGISTRY_ADDR,
)
from ai_brain import AIBrain, TradeDecision
from kraken_client import KrakenClient
from risk_manager import RiskManager
from state_store import AgentStateStore
from strategies import Signal, run_all_strategies
from trust_layer import TrustLayer

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt = "%H:%M:%S",
)
logger = logging.getLogger("PRISM-Agent")


class TradingAgent:
    """
    PRISM Autonomous Trading Agent
    ================================
    Tick-driven loop:
      1. Fetch market data for all trading pairs
      2. Run technical analysis strategies
      3. Ask Claude AI brain for a decision
      4. Run risk checks (circuit breakers, sizing)
      5. Execute via Kraken CLI
      6. Record trust signals on-chain via ERC-8004
      7. Sleep until next tick
    """

    def __init__(self):
        self.kraken = KrakenClient(
            api_key    = KRAKEN_API_KEY,
            api_secret = KRAKEN_API_SECRET,
            cli_path   = KRAKEN_CLI_PATH,
            paper      = PAPER_TRADING,
        )
        self.brain = AIBrain(api_key=ANTHROPIC_API_KEY)
        self.risk  = RiskManager(
            starting_capital   = STARTING_CAPITAL_USD,
            max_position_usd   = MAX_POSITION_USD,
            max_daily_loss_usd = MAX_DAILY_LOSS_USD,
            max_drawdown_pct   = MAX_DRAWDOWN_PCT,
            risk_per_trade_pct = RISK_PER_TRADE_PCT,
        )
        self.trust = TrustLayer(
            wallet_address       = AGENT_WALLET_ADDRESS,
            private_key          = AGENT_PRIVATE_KEY,
            rpc_url              = RPC_URL,
            chain_id             = CHAIN_ID,
            identity_addr        = IDENTITY_REGISTRY_ADDR,
            reputation_addr      = REPUTATION_REGISTRY_ADDR,
            validation_addr      = VALIDATION_REGISTRY_ADDR,
        )

        self.prices:    Dict[str, float] = {}
        self.latest_signals: Dict[str, List[Signal]] = {}
        self.last_decision: Optional[TradeDecision] = None
        self.tick_count = 0
        self.running    = False
        self.start_time = time.time()
        self.state_store = AgentStateStore()

    # ── Market data ────────────────────────────────────────────────────────────

    async def _fetch_market_data(self, pair: str) -> Optional[dict]:
        """Fetch OHLCV, ticker, order book, and recent trades concurrently."""
        try:
            ohlcv_task  = asyncio.create_task(self.kraken.get_ohlcv(pair, interval=60, count=100))
            ticker_task = asyncio.create_task(self.kraken.get_ticker(pair))
            book_task   = asyncio.create_task(self.kraken.get_order_book(pair, count=10))
            trades_task = asyncio.create_task(self.kraken.get_recent_trades(pair))

            candles, ticker, book, trades = await asyncio.gather(
                ohlcv_task, ticker_task, book_task, trades_task,
                return_exceptions=True,
            )

            if isinstance(candles, Exception) or not candles:
                logger.warning("No OHLCV data for %s", pair)
                return None

            closes  = [c.close  for c in candles]
            highs   = [c.high   for c in candles]
            lows    = [c.low    for c in candles]
            volumes = [c.volume for c in candles]
            price   = closes[-1]
            self.prices[pair] = price

            bids = book.bids if book and not isinstance(book, Exception) else []
            asks = book.asks if book and not isinstance(book, Exception) else []

            # Market context for the AI brain
            buy_trades = [t for t in (trades or []) if t["side"] == "buy"]
            buy_pct    = len(buy_trades) / max(len(trades or []), 1) * 100

            ticker_data    = ticker if ticker and not isinstance(ticker, Exception) else {}
            price_24h_ago  = float(ticker_data.get("o", price)) if ticker_data else price
            volume_24h     = float(ticker_data.get("v", [0, 0])[1]) * price if ticker_data else 0
            spread_pct     = ((asks[0]["price"] - bids[0]["price"]) / price) if bids and asks else 0

            market_context = {
                "price_change_24h": (price - price_24h_ago) / (price_24h_ago + 1e-9),
                "volume_24h":       volume_24h,
                "spread_pct":       spread_pct,
                "buy_pct":          buy_pct,
            }

            return {
                "pair":           pair,
                "price":          price,
                "closes":         closes,
                "highs":          highs,
                "lows":           lows,
                "volumes":        volumes,
                "bids":           bids,
                "asks":           asks,
                "market_context": market_context,
            }
        except Exception as e:
            logger.error("_fetch_market_data error (%s): %s", pair, e)
            return None

    # ── Tick logic ─────────────────────────────────────────────────────────────

    async def _tick_pair(self, pair: str):
        """One full decision cycle for a single trading pair."""
        data = await self._fetch_market_data(pair)
        if not data:
            return

        price          = data["price"]
        market_context = data["market_context"]

        # 1 — Technical signals
        signals = run_all_strategies(
            closes  = data["closes"],
            highs   = data["highs"],
            lows    = data["lows"],
            volumes = data["volumes"],
            bids    = data["bids"],
            asks    = data["asks"],
        )
        self.latest_signals[pair] = signals

        # 2 — AI decision
        portfolio_state = self.risk.portfolio_state(self.prices)
        decision = await self.brain.decide(
            pair            = pair,
            price           = price,
            signals         = signals,
            portfolio       = portfolio_state,
            market_context  = market_context,
            min_confidence  = MIN_CONFIDENCE,
        )
        self.last_decision = decision

        # 3 — On-chain validation artifact (async, non-blocking)
        asyncio.create_task(self.trust.record_trade_intent(
            pair       = pair,
            action     = decision.action,
            price      = price,
            confidence = decision.confidence,
            reasoning  = decision.reasoning,
        ))

        # 4 — Risk check
        risk = self.risk.check(
            pair        = pair,
            action      = decision.action,
            price       = price,
            confidence  = decision.confidence,
            volume_pct  = decision.volume_pct,
            prices      = self.prices,
        )

        if not risk.allowed:
            logger.info("[RISK VETO] %s — %s", pair, risk.reason)
            return

        # 5 — Execute
            if decision.action in ("buy", "sell"):
                await self._execute(pair, decision, risk.max_vol, price)
        self._write_state()

    async def _execute(self, pair: str, decision: TradeDecision, volume: float, price: float):
        """Execute the trade and update portfolio state."""
        try:
            # Close opposite position if open
            existing = self.risk.positions.get(pair)
            if existing:
                exit_price = self.prices.get(pair, existing.entry_price)
                pnl = self.risk.close_position(pair, exit_price, reason="signal_reversal")
                if pnl is not None:
                    await self.trust.record_trade_outcome(pair, pnl)

            # Place new order
            result = await self.kraken.place_market_order(
                pair   = pair,
                side   = decision.action,
                volume = volume,
                price  = price,
            )

            # Update risk manager
            side = "long" if decision.action == "buy" else "short"
            self.risk.open_position(
                order_id   = result.order_id,
                pair       = pair,
                side       = side,
                volume     = volume,
                price      = price,
                stop_loss  = decision.stop_loss,
                take_profit = decision.take_profit,
            )

            logger.info("✅ EXECUTED %s %s vol=%.6f @ $%.2f | ID=%s",
                        decision.action.upper(), pair, volume, price, result.order_id)

        except Exception as e:
            logger.error("Execution failed for %s: %s", pair, e)

    def _serialize_signals(self) -> Dict[str, list]:
        return {
            pair: [
                {
                    "strategy": signal.strategy,
                    "direction": signal.direction,
                    "strength": signal.strength,
                    "reason": signal.reason,
                }
                for signal in signals
            ]
            for pair, signals in self.latest_signals.items()
        }

    def _serialize_last_decision(self) -> dict:
        if not self.last_decision:
            return {
                "pair": "",
                "action": "hold",
                "confidence": 0.0,
                "reasoning": "No AI decision yet.",
            }
        return {
            "pair": self.last_decision.pair,
            "action": self.last_decision.action,
            "confidence": self.last_decision.confidence,
            "reasoning": self.last_decision.reasoning,
        }

    def _write_state(self):
        portfolio = self.risk.portfolio_state(self.prices)
        rep = self.trust.reputation_summary()
        state = {
            "mode": "PAPER" if PAPER_TRADING else "LIVE",
            "tick": self.tick_count,
            "uptime_sec": max(0, int(time.time() - self.start_time)),
            "capital": portfolio["total_value"],
            "cash_usd": portfolio["cash_usd"],
            "total_pnl": portfolio["total_pnl"],
            "daily_pnl": portfolio["daily_pnl"],
            "unrealized_pnl": portfolio["unrealized_pnl"],
            "drawdown_pct": portfolio["drawdown_pct"],
            "sharpe": portfolio["sharpe"],
            "win_rate": portfolio["win_rate"],
            "trade_count": portfolio["trade_count"],
            "open_positions": portfolio["open_positions"],
            "circuit_broken": portfolio["circuit_broken"],
            "pnl_series": self.risk.pnl_series(),
            "trades": self.risk.trade_history[-50:],
            "signals": self._serialize_signals(),
            "erc8004": {
                "registered": self.trust.registered,
                "agent_id": self.trust.agent_id or 0,
                "rep_score": int(rep["score"] * 100),
                "artifacts": len(self.trust.get_local_log()),
                "pass_rate": 10_000,
            },
            "last_decision": self._serialize_last_decision(),
        }
        self.state_store.write(state)

    # ── Main loop ──────────────────────────────────────────────────────────────

    async def run(self):
        self.running    = True
        self.start_time = time.time()
        mode = "PAPER" if PAPER_TRADING else "LIVE"
        logger.info("=" * 60)
        logger.info("🤖 PRISM Agent starting | mode=%s | pairs=%s", mode, TRADING_PAIRS)
        logger.info("   Capital: $%.0f | MaxPos: $%.0f | MaxDailyLoss: $%.0f",
                    STARTING_CAPITAL_USD, MAX_POSITION_USD, MAX_DAILY_LOSS_USD)
        logger.info("=" * 60)

        # Register agent identity on-chain (fire-and-forget)
        asyncio.create_task(self.trust.register_agent_identity())
        self._write_state()

        async with self.kraken:
            while self.running:
                self.tick_count += 1
                tick_start = time.time()

                try:
                    # Check stop-loss / take-profit exits
                    exits = self.risk.check_exits(self.prices)
                    for pair, reason in exits:
                        exit_price = self.prices.get(pair, 0)
                        pnl = self.risk.close_position(pair, exit_price, reason=reason)
                        if pnl is not None:
                            await self.trust.record_trade_outcome(pair, pnl)
                            logger.info("Auto-exit %s: %s | PnL=$%.2f", pair, reason, pnl)

                    # Run all pairs concurrently
                    await asyncio.gather(*[self._tick_pair(p) for p in TRADING_PAIRS])

                    state = self.risk.portfolio_state(self.prices)
                    logger.info("📊 Tick %d | Cash=$%.0f | PnL=$%+.2f | DD=%.1f%% | Sharpe=%.2f",
                                self.tick_count, state["cash_usd"],
                                state["total_pnl"], state["drawdown_pct"] * 100,
                                state["sharpe"])
                    self._write_state()

                except Exception as e:
                    logger.error("Tick error: %s", e)
                    self._write_state()

                elapsed = time.time() - tick_start
                sleep   = max(0, LOOP_INTERVAL_SEC - elapsed)
                await asyncio.sleep(sleep)

    def stop(self):
        self.running = False
        self._write_state()
        logger.info("Agent stopping. Total ticks: %d", self.tick_count)
