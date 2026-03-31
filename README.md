# AI Trading Bot

An AI-powered trading dashboard with a Web3 settlement layer for transparent, auditable trade recording.

A monorepo for a paper-trading and Web3-enabled trading dashboard built with React, Express, PostgreSQL, and Solidity.

The project includes:

- a Vite/React frontend for monitoring portfolio, trades, chain status, and agent controls
- an Express API server that exposes `/api/*` endpoints for trades, portfolio stats, agent status, and chain data
- a PostgreSQL-backed data layer for trades and agent decisions
- a Foundry-based smart contract workspace for on-chain trade settlement
- generated API schemas and React Query hooks shared across the frontend and backend

## Highlights

- 🤖 Autonomous agent control panel with live status, strategy view, and uptime
- 📈 Portfolio dashboard for total value, P&L, win rate, and trade history
- 🧾 Centralized off-chain storage for fast app reads and paper-trading workflows
- ⛓️ Solidity smart contract for on-chain settlement and immutable trade records
- 🔍 Transparent and auditable trade lifecycle through a Web3-backed ledger
- 🧠 Shared typed API contracts between frontend and backend using generated clients

## Why Solidity and Web3?

This project uses Solidity and Web3 so the system can do more than store trades in a normal database.

- ⛓️ Solidity is used to define the settlement logic in a smart contract
- 🛡️ Web3 gives the project an immutable on-chain ledger for finalized trades
- 🔎 Settled trades become independently verifiable instead of living only in backend storage
- 🤝 This reduces trust in a single server because the final record can be checked on-chain
- 📚 It creates a bridge between AI-driven trade decisions and transparent blockchain settlement

In short:

- off-chain handles speed, UI, agent state, and paper trading
- on-chain handles trust, auditability, and settlement history

## Stack

- Frontend: React, Vite, Tailwind, React Query
- Backend: Node.js, Express, Drizzle ORM
- Database: PostgreSQL
- Smart contracts: Solidity, Foundry, Anvil
- Shared tooling: pnpm workspaces, Orval, Zod, TypeScript

## Project Structure

```text
AI_agent_trading_bot/
├── artifacts/
│   ├── api-server/          # Express API server
│   └── trading-dashboard/   # React dashboard
├── contracts/               # Solidity contracts and scripts
├── lib/
│   ├── api-client-react/    # Generated React Query client
│   ├── api-spec/            # OpenAPI spec + Orval config
│   ├── api-zod/             # Generated Zod schemas/types
│   └── db/                  # Drizzle schema and DB package
├── scripts/                 # Utility scripts
└── LOCAL-RUN-GUIDE.md       # More detailed local setup instructions
```

## Features

- 📊 Portfolio summary dashboard
- 📒 Trade ledger view
- 🎛️ Agent control panel with status and uptime
- 🌐 Web3 settlement status and on-chain reporting
- 🔗 Shared typed API contracts between frontend and backend
- 🧪 Paper-trading oriented local development flow

## Prerequisites

- Node.js
- pnpm
- PostgreSQL
- Foundry and Anvil for contract development

Note: the current toolchain in this repo may require a newer Node runtime for some frontend/dev tooling.

## Installation

```bash
git clone <your-repo-url>
cd AI_agent_trading_bot
pnpm install
```

## Environment Variables

Create a root `.env` file:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/trading_bot
PORT=3001
CONTRACT_ADDRESS=
RPC_URL=http://127.0.0.1:8545
CHAIN_NETWORK=anvil-local
```

If you use `artifacts/api-server/.env`, keep it aligned with the root `.env` and avoid duplicate `DATABASE_URL` entries.

## Running Locally

### 1. Start PostgreSQL

Make sure your local database is running and the database in `DATABASE_URL` exists.

### 2. Start the API server

```bash
cd AI_agent_trading_bot
set -a
. ./.env
set +a
PORT=3001 pnpm --filter @workspace/api-server run dev
```

Health check:

```bash
curl http://127.0.0.1:3001/api/healthz
```

### 3. Start the frontend

```bash
cd AI_agent_trading_bot
API_ORIGIN=http://127.0.0.1:3001 PORT=5174 BASE_PATH=/ pnpm --filter @workspace/trading-dashboard run dev
```

Open:

```text
http://localhost:5174
```

## Smart Contracts

The contract workspace lives in [`contracts/`](/home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/contracts).

Common commands:

```bash
cd contracts
forge build
forge test
anvil
```

See the contracts README and the local run guide for deployment details.

## Shared API Tooling

- OpenAPI source: `lib/api-spec/openapi.yaml`
- React Query client: `lib/api-client-react`
- Zod schemas/types: `lib/api-zod`

These packages keep the frontend and backend aligned on request and response shapes.

## Workspace Scripts

From the repo root:

```bash
pnpm install
pnpm run build
pnpm run typecheck
```

## Troubleshooting

- `DATABASE_URL must be set`
  Load the root `.env` before starting the API server.

- `Cannot GET /` on port `3001`
  This is expected. The API is served under `/api`, for example `/api/healthz`.

- Frontend shows loading forever
  Usually means the dashboard cannot reach the API server or the API server is not running.

- `ECONNREFUSED 127.0.0.1:3001`
  Start the API server first, then restart the frontend.

## Additional Documentation

For a more detailed walkthrough, see:

- [LOCAL-RUN-GUIDE.md](/home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/LOCAL-RUN-GUIDE.md)
- [contracts/README.md](/home/bhavya_jain/Decentralized_AI_Trading_App/AI_agent_trading_bot/contracts/README.md)
