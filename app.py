"""
dashboard/app.py
PRISM Trading Agent — Live Dashboard
Run: streamlit run dashboard/app.py
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st
from streamlit_autorefresh import st_autorefresh

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title = "PRISM — AI Trading Agent",
    page_icon  = "🤖",
    layout     = "wide",
    initial_sidebar_state = "expanded",
)

# Auto-refresh every 30 seconds
st_autorefresh(interval=30_000, key="dashboard_refresh")

# ── Minimal dark styling ───────────────────────────────────────────────────────
st.markdown("""
<style>
.metric-card {
    background: #1a1a2e;
    border: 1px solid #2d2d44;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 8px;
}
.metric-value { font-size: 28px; font-weight: 600; margin: 4px 0; }
.metric-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.8px; }
.metric-delta-pos { color: #00d4aa; font-size: 13px; }
.metric-delta-neg { color: #ff4b6e; font-size: 13px; }
.status-live { color: #00d4aa; font-weight: 600; }
.status-paper { color: #f0a500; font-weight: 600; }
.signal-long  { color: #00d4aa; font-weight: 500; }
.signal-short { color: #ff4b6e; font-weight: 500; }
.signal-neutral { color: #888; }
.trust-score { font-size: 36px; font-weight: 700; color: #7c5df9; }
</style>
""", unsafe_allow_html=True)

# ── Simulated state (replace with real agent state file in production) ─────────

@st.cache_data(ttl=30)
def load_agent_state():
    """
    In production: read from a shared JSON file that the agent writes each tick.
    Example: agent writes state to /tmp/prism_state.json every tick.
    Here we simulate realistic data for the demo.
    """
    state_file = "/tmp/prism_state.json"
    if os.path.exists(state_file):
        with open(state_file) as f:
            return json.load(f)

    # Simulated realistic demo state
    np.random.seed(int(time.time()) // 30)   # changes every 30s for demo
    n_trades   = np.random.randint(15, 40)
    pnl_series = np.cumsum(np.random.normal(12, 80, n_trades))
    win_rate   = 0.58 + np.random.uniform(-0.05, 0.05)
    total_pnl  = float(pnl_series[-1]) if len(pnl_series) else 0

    trades = []
    base_time = time.time() - n_trades * 900
    for i in range(n_trades):
        side = "buy" if np.random.random() > 0.45 else "sell"
        pair = np.random.choice(["XBTUSD", "ETHUSD"])
        pnl  = float(np.random.normal(12, 75))
        trades.append({
            "pair":       pair,
            "side":       side,
            "pnl":        pnl,
            "pnl_pct":    pnl / 500,
            "confidence": round(np.random.uniform(0.65, 0.95), 2),
            "timestamp":  base_time + i * 900 + np.random.randint(0, 300),
            "reasoning":  np.random.choice([
                "EMA golden cross confirmed by RSI bounce from oversold zone.",
                "Volume surge on bid-heavy book — strong institutional buying.",
                "Bollinger Band squeeze breakout with momentum confirmation.",
                "RSI overbought + bearish volume divergence — taking profits.",
                "Mean reversion signal: price 2.3σ below 20-period MA.",
            ]),
        })

    # Simulated price series
    prices_btc = [85000 + i * np.random.normal(0, 200) for i in range(100)]
    prices_eth = [2100  + i * np.random.normal(0, 15)  for i in range(100)]

    return {
        "mode":             "PAPER",
        "tick":             np.random.randint(100, 300),
        "uptime_sec":       np.random.randint(3600, 86400),
        "capital":          10000 + total_pnl,
        "cash_usd":         5200 + total_pnl * 0.4,
        "total_pnl":        total_pnl,
        "daily_pnl":        float(np.random.normal(35, 60)),
        "unrealized_pnl":   float(np.random.normal(20, 40)),
        "drawdown_pct":     abs(float(np.random.normal(0.012, 0.008))),
        "sharpe":           round(float(np.random.normal(1.6, 0.3)), 2),
        "win_rate":         win_rate,
        "trade_count":      n_trades,
        "open_positions":   np.random.randint(0, 3),
        "circuit_broken":   False,
        "pnl_series":       list(pnl_series),
        "trades":           trades,
        "prices_btc":       prices_btc,
        "prices_eth":       prices_eth,
        "signals": {
            "XBTUSD": [
                {"strategy": "ema_crossover",        "direction": "long",  "strength": 0.72, "reason": "Golden cross"},
                {"strategy": "rsi",                  "direction": "long",  "strength": 0.61, "reason": "RSI at 34 (oversold)"},
                {"strategy": "bollinger",             "direction": "neutral","strength": 0.18,"reason": "Mid-band"},
                {"strategy": "volume_momentum",       "direction": "long",  "strength": 0.81, "reason": "1.4x volume surge"},
                {"strategy": "orderbook_imbalance",   "direction": "long",  "strength": 0.55, "reason": "28% bid imbalance"},
            ],
            "ETHUSD": [
                {"strategy": "ema_crossover",        "direction": "short", "strength": 0.44, "reason": "Below slow EMA"},
                {"strategy": "rsi",                  "direction": "neutral","strength": 0.15,"reason": "RSI at 52"},
                {"strategy": "bollinger",             "direction": "short", "strength": 0.67, "reason": "Above upper BB"},
                {"strategy": "volume_momentum",       "direction": "neutral","strength": 0.22,"reason": "Low volume"},
                {"strategy": "orderbook_imbalance",   "direction": "short", "strength": 0.39, "reason": "Ask pressure"},
            ],
        },
        "erc8004": {
            "registered":   True,
            "agent_id":     42,
            "rep_score":    7240,
            "artifacts":    n_trades * 3,
            "pass_rate":    9450,
        },
        "last_decision": {
            "pair":       "XBTUSD",
            "action":     "buy",
            "confidence": 0.81,
            "reasoning":  "4/5 signals bullish with strong volume confirmation. Risk-adjusted entry with stop at $83,400.",
        },
    }


state = load_agent_state()

# ── Sidebar ────────────────────────────────────────────────────────────────────
with st.sidebar:
    st.image("https://img.shields.io/badge/PRISM-AI%20Trading%20Agent-7c5df9?style=for-the-badge", use_column_width=True)
    st.markdown("---")

    mode_color = "status-paper" if state["mode"] == "PAPER" else "status-live"
    st.markdown(f"**Mode:** <span class='{mode_color}'>{state['mode']}</span>", unsafe_allow_html=True)
    st.markdown(f"**Tick:** #{state['tick']}")
    uptime = str(timedelta(seconds=int(state['uptime_sec'])))
    st.markdown(f"**Uptime:** {uptime}")

    if state["circuit_broken"]:
        st.error("⛔ Circuit Breaker ACTIVE")
    else:
        st.success("✅ Agent Running")

    st.markdown("---")
    st.markdown("**Trading Pairs**")
    for pair in ["XBTUSD", "ETHUSD"]:
        st.markdown(f"• {pair}")

    st.markdown("---")
    st.markdown("**Risk Limits**")
    st.markdown("• Max position: $500")
    st.markdown("• Daily loss limit: $100")
    st.markdown("• Max drawdown: 5%")
    st.markdown("• Min AI confidence: 65%")

    st.markdown("---")
    st.markdown("**[GitHub Repo](#)** | **[ERC-8004 Contracts](#)**")

# ── Header ─────────────────────────────────────────────────────────────────────
st.markdown("# 🤖 PRISM — AI Trading Agent")
st.markdown("*Autonomous trading powered by Claude AI + ERC-8004 trustless identity*")
st.markdown("---")

# ── KPI Row ────────────────────────────────────────────────────────────────────
c1, c2, c3, c4, c5, c6 = st.columns(6)

def kpi(col, label, value, delta=None, prefix="", suffix="", positive_good=True):
    with col:
        delta_html = ""
        if delta is not None:
            color = "pos" if (delta >= 0) == positive_good else "neg"
            sign  = "+" if delta >= 0 else ""
            delta_html = f"<div class='metric-delta-{color}'>{sign}{delta:.2f}{suffix}</div>"
        val_color = "#00d4aa" if (delta or 0) >= 0 else "#ff4b6e"
        st.markdown(f"""
        <div class="metric-card">
            <div class="metric-label">{label}</div>
            <div class="metric-value" style="color:{val_color}">{prefix}{value}</div>
            {delta_html}
        </div>
        """, unsafe_allow_html=True)

total_pnl = state["total_pnl"]
daily_pnl = state["daily_pnl"]

kpi(c1, "Total PnL",    f"${total_pnl:+,.2f}",   delta=total_pnl)
kpi(c2, "Daily PnL",    f"${daily_pnl:+,.2f}",    delta=daily_pnl)
kpi(c3, "Portfolio",    f"${state['capital']:,.0f}")
kpi(c4, "Sharpe Ratio", f"{state['sharpe']:.2f}",  delta=state['sharpe'] - 1.0)
kpi(c5, "Win Rate",     f"{state['win_rate']:.0%}", delta=state['win_rate'] - 0.5)
kpi(c6, "Drawdown",     f"{state['drawdown_pct']:.1%}", delta=-state['drawdown_pct'], positive_good=False, suffix="%")

# ── Charts ─────────────────────────────────────────────────────────────────────
col_chart, col_signals = st.columns([2, 1])

with col_chart:
    st.subheader("📈 Cumulative PnL")
    pnl_data = state["pnl_series"]
    n        = len(pnl_data)
    times    = [datetime.now() - timedelta(minutes=(n - i) * 15) for i in range(n)]

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x    = times,
        y    = pnl_data,
        mode = "lines",
        fill = "tozeroy",
        line = dict(color="#7c5df9", width=2),
        fillcolor = "rgba(124,93,249,0.12)",
        name = "Cumulative PnL",
    ))
    fig.update_layout(
        paper_bgcolor = "rgba(0,0,0,0)",
        plot_bgcolor  = "rgba(0,0,0,0)",
        margin        = dict(l=0, r=0, t=0, b=0),
        height        = 250,
        xaxis         = dict(showgrid=False, color="#888"),
        yaxis         = dict(showgrid=True, gridcolor="#2d2d44", color="#888",
                             tickprefix="$"),
        showlegend    = False,
    )
    st.plotly_chart(fig, use_container_width=True)

with col_signals:
    st.subheader("🎯 Live Signals")
    for pair, signals in state["signals"].items():
        st.markdown(f"**{pair}**")
        long_s  = sum(s["strength"] for s in signals if s["direction"] == "long")
        short_s = sum(s["strength"] for s in signals if s["direction"] == "short")
        bias    = "LONG" if long_s > short_s else "SHORT" if short_s > long_s else "NEUTRAL"
        color   = "signal-long" if bias == "LONG" else "signal-short" if bias == "SHORT" else "signal-neutral"
        st.markdown(f"<span class='{color}'>● {bias} BIAS</span>", unsafe_allow_html=True)
        for sig in signals:
            icon = "🟢" if sig["direction"] == "long" else "🔴" if sig["direction"] == "short" else "⚪"
            st.markdown(f"{icon} `{sig['strategy']}` — {sig['reason']}")
        st.markdown("---")

# ── AI Last Decision ───────────────────────────────────────────────────────────
st.subheader("🧠 Latest AI Decision")
dec = state["last_decision"]
action_color = "#00d4aa" if dec["action"] == "buy" else "#ff4b6e" if dec["action"] == "sell" else "#888"
st.markdown(f"""
<div style="background:#1a1a2e;border:1px solid #2d2d44;border-radius:12px;padding:16px 20px;">
    <span style="font-size:22px;font-weight:700;color:{action_color}">{dec['action'].upper()}</span>
    &nbsp;&nbsp;
    <span style="font-size:16px;color:#888">{dec['pair']}</span>
    &nbsp;&nbsp;
    <span style="background:#2d2d44;padding:3px 10px;border-radius:20px;font-size:13px;">
        Confidence: {dec['confidence']:.0%}
    </span>
    <br><br>
    <span style="color:#ccc;font-size:14px">💭 {dec['reasoning']}</span>
</div>
""", unsafe_allow_html=True)

# ── Trade History ──────────────────────────────────────────────────────────────
st.markdown("")
st.subheader("📋 Trade History")
trades_df = pd.DataFrame(state["trades"])
if not trades_df.empty:
    trades_df["time"]      = pd.to_datetime(trades_df["timestamp"], unit="s").dt.strftime("%H:%M:%S")
    trades_df["PnL"]       = trades_df["pnl"].map(lambda x: f"${x:+.2f}")
    trades_df["Conf"]      = trades_df["confidence"].map(lambda x: f"{x:.0%}")
    display_cols = ["time", "pair", "side", "PnL", "Conf", "reasoning"]
    display_df   = trades_df[display_cols].rename(columns={
        "time": "Time", "pair": "Pair", "side": "Side",
        "reasoning": "AI Reasoning"
    })

    def color_pnl(row):
        return ["background-color: rgba(0,212,170,0.08)" if row["PnL"].startswith("+") else
                "background-color: rgba(255,75,110,0.08)"] * len(row)

    st.dataframe(
        display_df.tail(20).style.apply(color_pnl, axis=1),
        use_container_width=True,
        height=350,
    )

# ── ERC-8004 Trust Layer ───────────────────────────────────────────────────────
st.markdown("")
st.subheader("🔗 ERC-8004 On-chain Trust")
erc = state["erc8004"]
e1, e2, e3, e4, e5 = st.columns(5)

with e1:
    st.metric("Status", "Registered" if erc["registered"] else "Unregistered")
with e2:
    st.metric("Agent ID", f"#{erc['agent_id']}")
with e3:
    rep_pct = erc["rep_score"] / 100
    st.metric("Reputation Score", f"{rep_pct:.0f}/100")
with e4:
    st.metric("Artifacts Recorded", erc["artifacts"])
with e5:
    pass_pct = erc["pass_rate"] / 100
    st.metric("Validation Pass Rate", f"{pass_pct:.1f}%")

# Reputation gauge
fig_rep = go.Figure(go.Indicator(
    mode  = "gauge+number",
    value = erc["rep_score"] / 100,
    domain = {"x": [0, 1], "y": [0, 1]},
    title  = {"text": "Reputation Score", "font": {"color": "#888"}},
    gauge  = {
        "axis": {"range": [0, 100], "tickcolor": "#888"},
        "bar":  {"color": "#7c5df9"},
        "bgcolor": "#1a1a2e",
        "steps": [
            {"range": [0,  40],  "color": "#2d1a2e"},
            {"range": [40, 70],  "color": "#1a2d2e"},
            {"range": [70, 100], "color": "#1a2e1a"},
        ],
        "threshold": {
            "line":  {"color": "#00d4aa", "width": 2},
            "value": 70,
        },
    },
    number = {"suffix": "/100", "font": {"color": "#7c5df9", "size": 36}},
))
fig_rep.update_layout(
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor ="rgba(0,0,0,0)",
    height=200,
    margin=dict(l=20, r=20, t=30, b=0),
    font=dict(color="#888"),
)
st.plotly_chart(fig_rep, use_container_width=True)

# ── Footer ─────────────────────────────────────────────────────────────────────
st.markdown("---")
st.markdown(
    f"<div style='text-align:center;color:#444;font-size:12px'>"
    f"PRISM AI Trading Agent · AI Trading Agents Hackathon 2026 · "
    f"Last updated: {datetime.now().strftime('%H:%M:%S')}"
    f"</div>",
    unsafe_allow_html=True,
)