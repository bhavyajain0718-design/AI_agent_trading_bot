"""
agent/strategies.py
Technical analysis strategies that produce raw signals.
The AI Brain in ai_brain.py then weighs these signals to make the
final trading decision.
"""

from dataclasses import dataclass
from typing import List, Optional

import numpy as np


@dataclass
class Signal:
    strategy:   str
    direction:  str    # "long" | "short" | "neutral"
    strength:   float  # 0.0 → 1.0
    reason:     str


def _ema(prices: np.ndarray, period: int) -> np.ndarray:
    k = 2.0 / (period + 1)
    ema = np.zeros_like(prices)
    ema[0] = prices[0]
    for i in range(1, len(prices)):
        ema[i] = prices[i] * k + ema[i - 1] * (1 - k)
    return ema


def _rsi(prices: np.ndarray, period: int = 14) -> float:
    if len(prices) < period + 1:
        return 50.0
    deltas = np.diff(prices[-(period + 1):])
    gains  = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = gains.mean()
    avg_loss = losses.mean()
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> float:
    if len(highs) < 2:
        return 0.0
    trs = []
    for i in range(1, len(highs)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    return float(np.mean(trs[-period:]))


def _bollinger(prices: np.ndarray, period: int = 20, std_dev: float = 2.0):
    if len(prices) < period:
        return None, None, None
    window = prices[-period:]
    mid    = window.mean()
    std    = window.std()
    return mid - std_dev * std, mid, mid + std_dev * std


# ── Strategy functions ─────────────────────────────────────────────────────────

def ema_crossover(closes: List[float], fast: int = 12, slow: int = 26) -> Signal:
    """Classic EMA crossover — momentum indicator."""
    if len(closes) < slow + 1:
        return Signal("ema_crossover", "neutral", 0.0, "Not enough data")

    arr      = np.array(closes)
    fast_ema = _ema(arr, fast)
    slow_ema = _ema(arr, slow)

    curr_diff = fast_ema[-1] - slow_ema[-1]
    prev_diff = fast_ema[-2] - slow_ema[-2]
    strength  = min(abs(curr_diff) / (slow_ema[-1] * 0.01 + 1e-9), 1.0)

    if curr_diff > 0 and prev_diff <= 0:
        return Signal("ema_crossover", "long",  min(strength * 1.5, 1.0), "Golden cross: fast EMA crossed above slow EMA")
    if curr_diff < 0 and prev_diff >= 0:
        return Signal("ema_crossover", "short", min(strength * 1.5, 1.0), "Death cross: fast EMA crossed below slow EMA")
    if curr_diff > 0:
        return Signal("ema_crossover", "long",  strength * 0.6, f"Fast EMA above slow by {curr_diff:.2f}")
    return Signal("ema_crossover", "short", strength * 0.6, f"Fast EMA below slow by {abs(curr_diff):.2f}")


def rsi_strategy(closes: List[float], period: int = 14,
                 oversold: float = 30.0, overbought: float = 70.0) -> Signal:
    """RSI mean-reversion strategy."""
    rsi_val = _rsi(np.array(closes), period)

    if rsi_val < oversold:
        strength = (oversold - rsi_val) / oversold
        return Signal("rsi", "long",  min(strength * 2.0, 1.0), f"RSI oversold at {rsi_val:.1f}")
    if rsi_val > overbought:
        strength = (rsi_val - overbought) / (100 - overbought)
        return Signal("rsi", "short", min(strength * 2.0, 1.0), f"RSI overbought at {rsi_val:.1f}")
    return Signal("rsi", "neutral", 0.2, f"RSI neutral at {rsi_val:.1f}")


def bollinger_band_strategy(closes: List[float]) -> Signal:
    """Bollinger Band breakout / mean-reversion."""
    if len(closes) < 22:
        return Signal("bollinger", "neutral", 0.0, "Not enough data")

    arr          = np.array(closes)
    lower, mid, upper = _bollinger(arr)
    price        = arr[-1]
    band_width   = (upper - lower) / (mid + 1e-9)
    position_pct = (price - lower) / (upper - lower + 1e-9)

    if price < lower:
        strength = min((lower - price) / (band_width * mid + 1e-9) * 10, 1.0)
        return Signal("bollinger", "long",  strength, f"Price below lower BB ({price:.2f} < {lower:.2f})")
    if price > upper:
        strength = min((price - upper) / (band_width * mid + 1e-9) * 10, 1.0)
        return Signal("bollinger", "short", strength, f"Price above upper BB ({price:.2f} > {upper:.2f})")
    if position_pct < 0.3:
        return Signal("bollinger", "long",  0.3, f"Price in lower third of BB ({position_pct:.0%})")
    if position_pct > 0.7:
        return Signal("bollinger", "short", 0.3, f"Price in upper third of BB ({position_pct:.0%})")
    return Signal("bollinger", "neutral", 0.1, f"Price mid-band ({position_pct:.0%})")


def volume_momentum(closes: List[float], volumes: List[float], window: int = 10) -> Signal:
    """Volume-weighted momentum — high volume moves are stronger signals."""
    if len(closes) < window + 1 or len(volumes) < window:
        return Signal("volume_momentum", "neutral", 0.0, "Not enough data")

    price_change   = (closes[-1] - closes[-window]) / (closes[-window] + 1e-9)
    avg_volume     = np.mean(volumes[-window:])
    recent_volume  = volumes[-1]
    volume_ratio   = recent_volume / (avg_volume + 1e-9)
    strength       = min(abs(price_change) * volume_ratio * 10, 1.0)

    if price_change > 0.005 and volume_ratio > 1.3:
        return Signal("volume_momentum", "long",  strength, f"Bullish volume surge: +{price_change:.1%} on {volume_ratio:.1f}x avg vol")
    if price_change < -0.005 and volume_ratio > 1.3:
        return Signal("volume_momentum", "short", strength, f"Bearish volume surge: {price_change:.1%} on {volume_ratio:.1f}x avg vol")
    return Signal("volume_momentum", "neutral", 0.1, f"Low conviction: Δ{price_change:.1%} @ {volume_ratio:.1f}x vol")


def order_book_imbalance(bids: List[dict], asks: List[dict], depth: int = 5) -> Signal:
    """Order book bid/ask imbalance — institutional pressure gauge."""
    if not bids or not asks:
        return Signal("orderbook_imbalance", "neutral", 0.0, "No order book data")

    bid_vol = sum(b["volume"] for b in bids[:depth])
    ask_vol = sum(a["volume"] for a in asks[:depth])
    total   = bid_vol + ask_vol + 1e-9
    imb     = (bid_vol - ask_vol) / total   # -1 → +1

    if imb > 0.20:
        return Signal("orderbook_imbalance", "long",  min(imb, 1.0), f"Bid-heavy book: {imb:.0%} imbalance — buying pressure")
    if imb < -0.20:
        return Signal("orderbook_imbalance", "short", min(-imb, 1.0), f"Ask-heavy book: {imb:.0%} imbalance — selling pressure")
    return Signal("orderbook_imbalance", "neutral", 0.1, f"Balanced book: {imb:.0%} imbalance")


def run_all_strategies(closes: List[float], highs: List[float], lows: List[float],
                       volumes: List[float], bids: List[dict], asks: List[dict]) -> List[Signal]:
    """Run every strategy and return all signals for the AI brain to weigh."""
    return [
        ema_crossover(closes),
        rsi_strategy(closes),
        bollinger_band_strategy(closes),
        volume_momentum(closes, volumes),
        order_book_imbalance(bids, asks),
    ]