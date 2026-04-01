# BHAVYA_TRADE

An autonomous AI trading dashboard with a transparent Web3 settlement layer, wallet-aware trade sessions, live paper-trading analytics, and immutable on-chain lifecycle recording on Ethereum Sepolia.

---

## What This Project Is

**BHAVYA_TRADE** is a full-stack, wallet-scoped, AI-assisted trading system built as a modern monorepo.

It combines:

- an autonomous trading agent that reads live crypto market data
- a polished dashboard for portfolio, trades, reasoning logs, and Web3 status
- a PostgreSQL data layer for fast off-chain state and analytics
- a Solidity smart contract ledger for immutable on-chain trade finalization
- typed API contracts shared across frontend and backend

This project is designed to show what a serious hybrid trading product can look like:

- **fast off-chain intelligence**
- **transparent on-chain verification**
- **clean user-facing product design**
- **wallet-specific trading sessions**

---

## Why This Project Stands Out

Most demos stop at either:

- a trading dashboard with no real settlement layer
- or a smart contract with no usable product around it

This project bridges both worlds.

It delivers:

- live market-aware paper trading
- autonomous trade reasoning
- wallet-gated user flows
- on-chain recording of finalized trade lifecycle events
- Sepolia Etherscan-verifiable settlement history

In short: **this is not just a UI and not just a contract. It is an end-to-end AI x Web3 trading system.**

---

## Screenshots

Add your product screenshots here.

### Dashboard Preview

```md
![Dashboard Preview](./docs/screenshots/dashboard.png)
```

### Markets Preview

```md
![Markets Preview](./docs/screenshots/markets.png)
```

### Trade Ledger Preview

```md
![Trade Ledger Preview](./docs/screenshots/trades.png)
```

### Web3 Settlement Preview

```md
![Web3 Settlement Preview](./docs/screenshots/web3.png)
```

### Agent Control Preview

```md
![Agent Control Preview](./docs/screenshots/agent.png)
```

---

## Core Product Flow

1. A user connects a wallet.
2. The trading engine starts reading live Kraken market data.
3. The strategy evaluates technical conditions and logs reasoning.
4. Open trades remain visible in the **Trades** page with live running P&L.
5. When a trade completes, it is finalized on-chain.
6. Completed on-chain transactions move into the **Web3 Settlement** page.
7. The dashboard updates wallet-specific stats, cumulative P&L, and on-chain settlement counts.

This keeps the experience simple:

- **Trades** = active positions
- **Web3 Settlement** = completed on-chain outcomes

---

## Tech Stack

### Frontend

- **React 19**
- **Vite**
- **TypeScript**
- **TanStack React Query**
- **Tailwind CSS**
- **Radix UI**
- **Recharts**
- **Wouter**
- **Lucide React**

### Backend

- **Node.js**
- **Express 5**
- **TypeScript**
- **Drizzle ORM**
- **PostgreSQL**
- **Pino**
- **esbuild**

### Smart Contracts / Web3

- **Solidity**
- **Foundry**
- **Forge**
- **Cast**
- **Anvil**
- **Ethereum Sepolia**
- **Alchemy RPC**
- **Sepolia Etherscan**

### Shared Infrastructure

- **pnpm workspaces**
- **Zod**
- **OpenAPI-derived typed contracts**
- **Generated React Query client**
- **Shared database package**

---

## Architecture

```text
AI_agent_trading_bot/
├── artifacts/
│   ├── trading-dashboard/      # React/Vite frontend
│   └── api-server/             # Express API server
├── contracts/                  # Solidity smart contracts + Foundry workspace
├── lib/
│   ├── api-client-react/       # Generated React Query hooks
│   ├── api-spec/               # API spec and generation config
│   ├── api-zod/                # Shared request/response schemas
│   └── db/                     # Drizzle schema + shared DB models
├── scripts/                    # Utility and workspace scripts
└── README.md
```

---

## What Was Built

### 1. Wallet-Scoped Product Experience

The app is not a generic shared dashboard.

It was built so that:

- the user connects a wallet
- wallet-gated pages unlock
- trades, settlements, and agent state are scoped to that wallet
- dashboard metrics are shown per wallet session

### 2. Autonomous Market Engine

The backend agent:

- reads tracked crypto pairs
- evaluates strategy signals
- logs reasoning and technical indicators
- opens trades when the execution threshold is met
- auto-closes trades on opposite signals
- records finalized trade outcomes on-chain

### 3. Hybrid Off-Chain / On-Chain Design

This project intentionally uses both off-chain and on-chain layers:

- **Off-chain** handles speed, market reads, live UI, reasoning logs, and open-position state
- **On-chain** handles finalized trade recording and auditability

That split is what makes the project practical and still verifiable.

### 4. Full Product Surfaces

The system includes:

- **Dashboard**
  - total value
  - net P&L
  - win rate
  - on-chain settlement count
  - cumulative P&L chart

- **Markets**
  - live chart views
  - multiple timeframes
  - exchange overview

- **Trades**
  - active positions only
  - live running P&L
  - opening transaction visibility

- **Web3 Settlement**
  - completed on-chain transactions only
  - wallet-specific settlement ledger
  - Sepolia Etherscan navigation

- **Agent Control**
  - wallet-scoped execution
  - strategy state
  - reasoning log
  - execution status visibility

---

## Smart Contract Layer

The Solidity contract is used as the immutable trade ledger.

It is designed to support lifecycle recording for trade events and makes final outcomes independently auditable. The Web3 subsystem reads those finalized events and presents them back to the user as verifiable records.

This enables:

- immutable trade finalization
- wallet-scoped settlement visibility
- blockchain-backed auditability
- Sepolia Etherscan verification

Contract workspace:

- [contracts/README.md](/home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/contracts/README.md)

---

## Typed Monorepo Design

One of the strongest engineering parts of this project is the shared typed workspace model.

Instead of loosely connecting frontend and backend with ad-hoc JSON, the project uses:

- shared API schemas
- generated request/response typing
- generated React Query clients
- a shared DB schema package

That means:

- safer refactors
- fewer runtime mismatches
- better developer velocity
- cleaner product iteration

---

## Local Development Prerequisites

Make sure these are installed:

- **Node.js**
- **pnpm**
- **PostgreSQL**
- **Foundry**
- **Anvil**

Optional but useful:

- MetaMask / Coinbase Wallet / Rabby in browser
- Sepolia ETH for the settlement wallet

---

## Environment Setup

The main runtime env for the backend lives in:

- [artifacts/api-server/.env](/home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/artifacts/api-server/.env)

Typical variables used by this project:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/trading_bot
PORT=3002

RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
CHAIN_NETWORK=sepolia
CONTRACT_ADDRESS=0xYOUR_SEPOLIA_CONTRACT
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY

EXECUTION_CONFIDENCE_THRESHOLD=0.6
AGENT_TIMEFRAME=5m
AGENT_LOOP_INTERVAL_MS=10000
```

Important:

- treat `DEPLOYER_PRIVATE_KEY` as sensitive
- never commit real private keys
- rotate keys if they were ever exposed

---

## How To Run Locally

### 1. Install Dependencies

From the repo root:

```bash
pnpm install
```

### 2. Start PostgreSQL

Make sure your PostgreSQL instance is running and the database in `DATABASE_URL` already exists.

### 3. Start the API Server

```bash
cd /home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/artifacts/api-server
pnpm run dev
```

Expected API base:

```text
http://127.0.0.1:3002
```

### 4. Start the Frontend

```bash
cd /home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/artifacts/trading-dashboard
PORT=5173 BASE_PATH=/ API_ORIGIN=http://127.0.0.1:3002 pnpm run dev
```

Open:

```text
http://localhost:5173
```

### 5. Optional: Run Anvil Locally

If you want a local EVM network instead of Sepolia:

```bash
anvil
```

---

## Useful Commands

From repo root:

```bash
pnpm install
pnpm run build
pnpm run typecheck
```

API only:

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run dev
```

Frontend only:

```bash
pnpm --filter @workspace/trading-dashboard run build
pnpm --filter @workspace/trading-dashboard run dev
```

Contracts:

```bash
cd contracts
forge build
forge test
anvil
```

---

## How The System Works

### Market Data

The project consumes live market data from Kraken public endpoints.

That data powers:

- dashboard tickers
- market charts
- agent signal generation
- live trade P&L updates

### Agent Execution

The agent reads market snapshots on a configured timeframe such as:

- `5m`
- `10m`
- `30m`
- `1h`
- `1d`

It then:

- computes signals
- logs reasoning
- opens qualifying positions
- auto-closes positions when signals reverse

### On-Chain Settlement

When a trade completes, finalized trade outcomes are recorded on-chain and surfaced inside the Web3 subsystem.

That allows users to:

- verify completion records
- inspect transaction hashes
- navigate to Sepolia Etherscan

---

## Why The Project Uses Both AI and Web3

This project is built around a practical principle:

- **AI is useful for decision-making**
- **blockchain is useful for auditability**

Trying to force everything fully on-chain would make the product slower and less usable.
Keeping everything fully off-chain would make the final trade history less transparent.

So this project uses each layer where it is strongest.

That is the real product idea:

- AI for signal generation
- modern web tech for user experience
- Web3 for verification and trust

---

## Resume / Portfolio Value

This project demonstrates:

- full-stack TypeScript engineering
- React product design
- Express backend API design
- database modeling with Drizzle and PostgreSQL
- wallet-aware Web3 product flows
- Solidity smart contract integration
- on-chain/off-chain architecture design
- typed monorepo development
- realtime dashboard UX

It is a strong portfolio piece because it is both:

- technically deep
- visually product-oriented

---

## Roadmap Ideas

Potential next upgrades:

- deploy the upgraded lifecycle contract to Sepolia
- stream live on-chain confirmations back to the UI
- add trade-level drilldown pages
- add downloadable reports
- add strategy switching and parameter tuning
- add richer backtesting and analytics
- support multiple agents and portfolios

---

## Troubleshooting

### API says port already in use

That means another instance is already running on the same port.

Stop it first or kill the port:

```bash
fuser -k 3002/tcp
```

### Frontend shows `ECONNREFUSED`

The UI cannot reach the API.

Make sure:

- the API server is running
- `API_ORIGIN` points to the correct backend port

### Dashboard looks stale after backend changes

Restart the API server and refresh the browser.

### Forge command not found

Install Foundry first:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

---

## Additional Docs

- [contracts/README.md](/home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/contracts/README.md)

---

## Final Note

**BHAVYA_TRADE** is built as a modern demonstration of what happens when AI agents, strong frontend engineering, typed backend systems, and Web3 verification are treated as one product instead of separate experiments.

It is a trading interface, an engineering system, and a portfolio-grade showcase in one repository.
