"""
agent/risk_manager.py
Production-grade risk management:
  - Position sizing (Kelly-inspired, capped)
  - Daily loss circuit breaker
  - Max drawdown circuit breaker
  - Portfolio heat tracking
  - Stop-loss enforcement
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class Position:
    pair:         str
    side:         str    # "long" | "short"
    volume:       float
    entry_price:  float
    stop_loss:    Optional[float]
    take_profit:  Optional[float]
    order_id:     str
    opened_at:    float = field(default_factory=time.time)

    def pnl(self, current_price: float) -> float:
        if self.side == "long":
            return (current_price - self.entry_price) * self.volume
        return (self.entry_price - current_price) * self.volume

    def pnl_pct(self, current_price: float) -> float:
        return self.pnl(current_price) / (self.entry_price * self.volume + 1e-9)


@dataclass
class RiskCheck:
    allowed:  bool
    reason:   str
    max_vol:  float = 0.0


class RiskManager:
    """
    Enforces all risk limits before any order reaches the exchange.
    The risk manager is the last line of defense — it can veto any trade.
    """

    def __init__(self, starting_capital: float, max_position_usd: float,
                 max_daily_loss_usd: float, max_drawdown_pct: float,
                 risk_per_trade_pct: float):
        self.starting_capital   = starting_capital
        self.peak_capital       = starting_capital
        self.cash_usd           = starting_capital
        self.max_position_usd   = max_position_usd
        self.max_daily_loss_usd = max_daily_loss_usd
        self.max_drawdown_pct   = max_drawdown_pct
        self.risk_per_trade_pct = risk_per_trade_pct

        self.positions:      Dict[str, Position] = {}
        self.daily_pnl:      float = 0.0
        self.total_pnl:      float = 0.0
        self.realized_pnl:   float = 0.0
        self.trade_history:  List[dict] = []
        self._day_reset_ts:  float = time.time()
        self.circuit_broken: bool = False

    # ── State helpers ──────────────────────────────────────────────────────────

    def _reset_daily_if_needed(self):
        now = time.time()
        if now - self._day_reset_ts > 86400:
            logger.info("Resetting daily PnL (was $%.2f)", self.daily_pnl)
            self.daily_pnl     = 0.0
            self._day_reset_ts = now

    def unrealized_pnl(self, prices: Dict[str, float]) -> float:
        return sum(pos.pnl(prices.get(pos.pair, pos.entry_price))
                   for pos in self.positions.values())

    def portfolio_value(self, prices: Dict[str, float]) -> float:
        return self.cash_usd + sum(
            pos.volume * prices.get(pos.pair, pos.entry_price)
            for pos in self.positions.values()
        )

    def drawdown_pct(self, prices: Dict[str, float]) -> float:
        val = self.portfolio_value(prices)
        self.peak_capital = max(self.peak_capital, val)
        return (self.peak_capital - val) / (self.peak_capital + 1e-9)

    # ── Pre-trade risk check ───────────────────────────────────────────────────

    def check(self, pair: str, action: str, price: float,
              confidence: float, volume_pct: float,
              prices: Dict[str, float]) -> RiskCheck:
        self._reset_daily_if_needed()

        if self.circuit_broken:
            return RiskCheck(False, "Circuit breaker active — trading halted for today")

        if action == "hold":
            return RiskCheck(True, "Hold — no risk check needed")

        # Daily loss limit
        if self.daily_pnl <= -self.max_daily_loss_usd:
            self.circuit_broken = True
            logger.warning("CIRCUIT BREAKER: Daily loss $%.2f exceeded limit $%.2f",
                           abs(self.daily_pnl), self.max_daily_loss_usd)
            return RiskCheck(False, f"Daily loss limit hit (${abs(self.daily_pnl):.0f} / ${self.max_daily_loss_usd:.0f})")

        # Max drawdown
        dd = self.drawdown_pct(prices)
        if dd >= self.max_drawdown_pct:
            self.circuit_broken = True
            logger.warning("CIRCUIT BREAKER: Drawdown %.1f%% exceeded limit %.1f%%",
                           dd * 100, self.max_drawdown_pct * 100)
            return RiskCheck(False, f"Max drawdown hit ({dd:.1%} / {self.max_drawdown_pct:.1%})")

        # Already have position in this pair
        if pair in self.positions and action == "buy":
            return RiskCheck(False, f"Already holding {pair} — no pyramiding")

        # Insufficient cash
        risk_usd = self.cash_usd * self.risk_per_trade_pct
        max_usd  = min(risk_usd * (confidence / 0.65), self.max_position_usd) * volume_pct
        if max_usd < 10:
            return RiskCheck(False, f"Position too small (${max_usd:.2f}) — below $10 minimum")
        if max_usd > self.cash_usd:
            max_usd = self.cash_usd * 0.95

        volume = max_usd / (price + 1e-9)
        logger.info("Risk check PASSED — max_usd=$%.2f vol=%.6f dd=%.1f%%", max_usd, volume, dd * 100)
        return RiskCheck(True, "All risk checks passed", max_vol=volume)

    # ── Position tracking ──────────────────────────────────────────────────────

    def open_position(self, order_id: str, pair: str, side: str,
                      volume: float, price: float,
                      stop_loss: Optional[float], take_profit: Optional[float]):
        cost = volume * price
        self.cash_usd -= cost
        self.positions[pair] = Position(pair, side, volume, price,
                                        stop_loss, take_profit, order_id)
        logger.info("Position opened: %s %s vol=%.6f @ $%.2f cost=$%.2f",
                    side, pair, volume, price, cost)

    def close_position(self, pair: str, exit_price: float, reason: str = "signal") -> Optional[float]:
        pos = self.positions.pop(pair, None)
        if not pos:
            return None
        pnl = pos.pnl(exit_price)
        proceeds = pos.volume * exit_price
        self.cash_usd    += proceeds
        self.daily_pnl   += pnl
        self.total_pnl   += pnl
        self.realized_pnl += pnl
        record = {
            "pair":        pair,
            "side":        pos.side,
            "volume":      pos.volume,
            "entry":       pos.entry_price,
            "exit":        exit_price,
            "pnl":         pnl,
            "pnl_pct":     pos.pnl_pct(exit_price),
            "reason":      reason,
            "held_sec":    time.time() - pos.opened_at,
            "closed_at":   time.time(),
        }
        self.trade_history.append(record)
        logger.info("Position closed: %s PnL=$%.2f (%.1f%%) reason=%s",
                    pair, pnl, pos.pnl_pct(exit_price) * 100, reason)
        return pnl

    def check_exits(self, prices: Dict[str, float]) -> List[tuple]:
        """Return list of (pair, reason) that should be closed."""
        exits = []
        for pair, pos in list(self.positions.items()):
            price = prices.get(pair)
            if not price:
                continue
            if pos.stop_loss and pos.side == "long"  and price <= pos.stop_loss:
                exits.append((pair, f"Stop loss hit @ ${price:.2f}"))
            if pos.stop_loss and pos.side == "short" and price >= pos.stop_loss:
                exits.append((pair, f"Stop loss hit @ ${price:.2f}"))
            if pos.take_profit and pos.side == "long"  and price >= pos.take_profit:
                exits.append((pair, f"Take profit hit @ ${price:.2f}"))
            if pos.take_profit and pos.side == "short" and price <= pos.take_profit:
                exits.append((pair, f"Take profit hit @ ${price:.2f}"))
        return exits

    # ── Metrics ────────────────────────────────────────────────────────────────

    def sharpe_ratio(self) -> float:
        if len(self.trade_history) < 3:
            return 0.0
        returns = [t["pnl_pct"] for t in self.trade_history]
        import numpy as np
        arr = np.array(returns)
        if arr.std() == 0:
            return 0.0
        return float((arr.mean() / arr.std()) * (252 ** 0.5))

    def win_rate(self) -> float:
        if not self.trade_history:
            return 0.0
        wins = sum(1 for t in self.trade_history if t["pnl"] > 0)
        return wins / len(self.trade_history)

    def portfolio_state(self, prices: Dict[str, float]) -> dict:
        return {
            "cash_usd":        self.cash_usd,
            "total_value":     self.portfolio_value(prices),
            "daily_pnl":       self.daily_pnl,
            "total_pnl":       self.total_pnl,
            "realized_pnl":    self.realized_pnl,
            "unrealized_pnl":  self.unrealized_pnl(prices),
            "drawdown_pct":    self.drawdown_pct(prices),
            "daily_loss_pct":  abs(min(self.daily_pnl, 0)) / (self.max_daily_loss_usd + 1e-9),
            "open_positions":  len(self.positions),
            "circuit_broken":  self.circuit_broken,
            "sharpe":          self.sharpe_ratio(),
            "win_rate":        self.win_rate(),
            "trade_count":     len(self.trade_history),
        }

    def pnl_series(self) -> List[float]:
        series = []
        running = 0.0
        for trade in self.trade_history:
            running += trade["pnl"]
            series.append(running)
        return series
