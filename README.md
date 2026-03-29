# 🤖 PRISM — Autonomous AI Trading Agent

> **AI Trading Agents Hackathon 2026** — Built for both the Kraken CLI and ERC-8004 challenges.

PRISM is a production-grade autonomous trading agent that combines Claude AI signal intelligence, technical analysis, on-chain identity, and trustless reputation to trade crypto markets with verifiable, auditable behavior.

---

## Architecture

```
Market Data (Kraken REST)
        │
        ▼
Technical Strategies ──────► AI Brain (Claude)
 • EMA Crossover               │ Synthesizes all signals
 • RSI Mean-Reversion          │ Produces structured decision
 • Bollinger Bands             │ JSON: {action, confidence, sizing}
 • Volume Momentum             │
 • Order Book Imbalance        ▼
                         Risk Manager
                          • Position sizing
                          • Circuit breakers
                          • Daily loss limits
                          • Drawdown control
                               │
                               ▼
                    Kraken CLI Execution
                               │
                               ▼
                   ERC-8004 Trust Layer
                    • Trade intent (signed EIP-712)
                    • Reputation update on-chain
                    • Validation artifact recorded
```

---

## Quickstart

### 1. Clone & install
```bash
git clone https://github.com/YOUR_USERNAME/prism-trading-agent
cd prism-trading-agent
pip install -r requirements.txt
```

### 2. Configure
```bash
cp .env.example .env
# Fill in KRAKEN_API_KEY, ANTHROPIC_API_KEY, AGENT_WALLET_ADDRESS, etc.
```

### 3. Install Kraken CLI
```bash
# Download from: https://github.com/kraken-cli/kraken-cli/releases
chmod +x kraken
export PATH=$PATH:$(pwd)
```

### 4. Deploy smart contracts (optional for ERC-8004 track)
```bash
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network base-sepolia
# Copy contract addresses into your .env
```

### 5. Run the agent
```bash
python main.py            # start trading (paper mode by default)
python main.py --dry-run  # validate config only
```

### 6. Launch dashboard
```bash
streamlit run dashboard/app.py
```

---

## Project Structure

```
prism-trading-agent/
├── main.py                     # Entry point
├── config.py                   # All config from .env
├── requirements.txt
├── hardhat.config.js
│
├── agent/
│   ├── kraken_client.py        # Kraken REST + CLI wrapper
│   ├── strategies.py           # 5 technical analysis strategies
│   ├── ai_brain.py             # Claude AI decision engine
│   ├── risk_manager.py         # Position sizing + circuit breakers
│   └── trading_agent.py        # Main agent loop orchestrator
│
├── erc8004/
│   └── trust_layer.py          # On-chain identity + reputation + validation
│
├── contracts/
│   ├── AgentIdentity.sol       # ERC-8004 soulbound identity NFT
│   ├── ReputationRegistry.sol  # On-chain reputation accumulation
│   └── ValidationRegistry.sol  # EIP-712 validation artifacts
│
├── scripts/
│   └── deploy.js               # Hardhat deployment script
│
└── dashboard/
    └── app.py                  # Streamlit live dashboard
```

---

## Trading Strategies

| Strategy | Signal | Description |
|---|---|---|
| EMA Crossover | Momentum | Fast/slow EMA crossover (12/26 period) |
| RSI | Mean-reversion | Oversold (<30) / Overbought (>70) |
| Bollinger Bands | Breakout | Price vs upper/lower bands |
| Volume Momentum | Confirmation | Volume-weighted price change |
| Order Book Imbalance | Microstructure | Bid/ask volume ratio |

All signals are fed to **Claude AI (claude-sonnet)** which synthesizes them into a single structured decision with confidence score, position sizing, stop-loss, and take-profit levels.

---

## Risk Controls

- **Position sizing**: Kelly-inspired, capped at configurable max
- **Daily loss limit**: Circuit breaker halts trading for the day
- **Max drawdown**: Portfolio-level circuit breaker
- **Min AI confidence**: Trades only when Claude is >65% confident
- **Stop-loss / take-profit**: Automated exit monitoring every tick

---

## ERC-8004 Compliance

| Component | Implementation |
|---|---|
| Agent Identity | `AgentIdentity.sol` — soulbound ERC-721 |
| Reputation | `ReputationRegistry.sol` — objective PnL-based scoring |
| Validation | `ValidationRegistry.sol` — EIP-712 signed artifacts |
| Trade Intents | Signed with EIP-712, replayed on-chain |
| Chain binding | EIP-155 (Base Sepolia / Base Mainnet) |
| Smart wallets | EIP-1271 `isValidSignature` support |

---

## Tech Stack

- **Python** — agent core, async trading loop
- **Kraken CLI** — order execution and market data
- **Anthropic Claude** — AI signal synthesis and decision engine
- **Solidity 0.8.24** — ERC-8004 smart contracts
- **Hardhat** — contract compilation and deployment
- **Web3.py** — on-chain interaction from Python
- **Streamlit** — live trading dashboard
- **Plotly** — charts and visualizations
- **Base Sepolia** — testnet deployment (Base Mainnet ready)

---

## License

MIT — built for the AI Trading Agents Hackathon 2026.