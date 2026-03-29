"""
agent/ai_brain.py
The AI brain — Claude analyzes all technical signals, market context,
and portfolio state to produce a final high-confidence trading decision.
This is the core differentiator of the project.
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import List, Optional

import anthropic

from strategies import Signal

logger = logging.getLogger(__name__)


@dataclass
class TradeDecision:
    pair:         str
    action:       str          # "buy" | "sell" | "hold"
    confidence:   float        # 0.0 → 1.0
    volume_pct:   float        # % of max position to use
    reasoning:    str
    stop_loss:    Optional[float]
    take_profit:  Optional[float]
    timestamp:    float = 0.0

    def __post_init__(self):
        self.timestamp = time.time()


SYSTEM_PROMPT = """You are PRISM — a professional-grade AI trading agent brain operating
inside an autonomous crypto trading system.

Your role is to synthesize technical indicator signals, market microstructure data,
and portfolio context into a single high-conviction trading decision.

You think like a quantitative hedge fund analyst: disciplined, data-driven, and always
risk-aware. You never FOMO. You never revenge-trade. You size positions conservatively
when conviction is low.

Rules you NEVER break:
- Never suggest trading more than the allowed position limit
- Never override the risk manager's circuit breaker
- If signals are mixed or weak, output "hold" — cash is a position
- Always provide a stop_loss and take_profit level in USD
- Your confidence score must reflect signal agreement, not wishful thinking

Output ONLY valid JSON. No preamble, no markdown, no explanation outside the JSON.

Output schema:
{
  "action": "buy" | "sell" | "hold",
  "confidence": 0.0-1.0,
  "volume_pct": 0.0-1.0,
  "stop_loss": <float or null>,
  "take_profit": <float or null>,
  "reasoning": "<concise 2-3 sentence explanation>"
}"""


def _build_user_message(pair: str, price: float, signals: List[Signal],
                         portfolio: dict, market_context: dict) -> str:
    signal_block = "\n".join([
        f"  [{s.strategy.upper()}] direction={s.direction} strength={s.strength:.2f} → {s.reason}"
        for s in signals
    ])

    long_count    = sum(1 for s in signals if s.direction == "long")
    short_count   = sum(1 for s in signals if s.direction == "short")
    avg_strength  = sum(s.strength for s in signals) / max(len(signals), 1)

    return f"""
TRADING PAIR: {pair}
CURRENT PRICE: ${price:,.2f}
TIMESTAMP: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}

TECHNICAL SIGNALS ({long_count} long / {short_count} short / avg strength {avg_strength:.2f}):
{signal_block}

PORTFOLIO STATE:
  Cash (USD):         ${portfolio.get('cash_usd', 0):,.2f}
  Open positions:     {portfolio.get('open_positions', 0)}
  Daily PnL:          ${portfolio.get('daily_pnl', 0):+,.2f}
  Daily loss used:    {portfolio.get('daily_loss_pct', 0):.1%} of limit
  Current drawdown:   {portfolio.get('drawdown_pct', 0):.1%}
  Unrealized PnL:     ${portfolio.get('unrealized_pnl', 0):+,.2f}

MARKET CONTEXT:
  24h price change:   {market_context.get('price_change_24h', 0):.2%}
  24h volume:         ${market_context.get('volume_24h', 0):,.0f}
  Bid-ask spread:     {market_context.get('spread_pct', 0):.4%}
  Recent trade flow:  {market_context.get('buy_pct', 50):.0f}% buys / {100 - market_context.get('buy_pct', 50):.0f}% sells

Based on all the above, provide your trading decision as JSON.
"""


class AIBrain:
    """Claude-powered trading decision engine."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model  = model
        self.decision_history: List[TradeDecision] = []

    async def decide(self, pair: str, price: float, signals: List[Signal],
                     portfolio: dict, market_context: dict,
                     min_confidence: float = 0.65) -> TradeDecision:
        """
        Feed all signals + context to Claude and get back a structured
        trading decision. Returns a "hold" decision if anything goes wrong.
        """
        user_msg = _build_user_message(pair, price, signals, portfolio, market_context)

        try:
            response = self.client.messages.create(
                model      = self.model,
                max_tokens = 512,
                system     = SYSTEM_PROMPT,
                messages   = [{"role": "user", "content": user_msg}],
            )
            raw  = response.content[0].text.strip()
            data = json.loads(raw)

            decision = TradeDecision(
                pair        = pair,
                action      = data.get("action", "hold"),
                confidence  = float(data.get("confidence", 0.0)),
                volume_pct  = float(data.get("volume_pct", 0.0)),
                reasoning   = data.get("reasoning", ""),
                stop_loss   = data.get("stop_loss"),
                take_profit = data.get("take_profit"),
            )

            # Hard override: if AI confidence < threshold → hold
            if decision.confidence < min_confidence and decision.action != "hold":
                logger.info("AI confidence %.2f below threshold %.2f — overriding to hold",
                            decision.confidence, min_confidence)
                decision.action     = "hold"
                decision.volume_pct = 0.0
                decision.reasoning += f" [Overridden to HOLD: confidence {decision.confidence:.0%} < {min_confidence:.0%} threshold]"

            self.decision_history.append(decision)
            logger.info("[AI] %s %s conf=%.2f vol=%.0f%%",
                        decision.action.upper(), pair, decision.confidence, decision.volume_pct * 100)
            return decision

        except json.JSONDecodeError as e:
            logger.error("AI returned non-JSON: %s | raw: %s", e, raw[:200])
            return self._hold(pair, price, f"JSON parse error: {e}")
        except anthropic.APIError as e:
            logger.error("Anthropic API error: %s", e)
            return self._hold(pair, price, f"API error: {e}")
        except Exception as e:
            logger.error("AIBrain.decide error: %s", e)
            return self._hold(pair, price, str(e))

    def _hold(self, pair: str, price: float, reason: str) -> TradeDecision:
        return TradeDecision(pair, "hold", 0.0, 0.0, reason, None, None)

    def summary(self) -> dict:
        if not self.decision_history:
            return {"total": 0}
        buys  = sum(1 for d in self.decision_history if d.action == "buy")
        sells = sum(1 for d in self.decision_history if d.action == "sell")
        holds = sum(1 for d in self.decision_history if d.action == "hold")
        return {
            "total": len(self.decision_history),
            "buys":  buys,
            "sells": sells,
            "holds": holds,
            "avg_confidence": sum(d.confidence for d in self.decision_history) / len(self.decision_history),
        }
