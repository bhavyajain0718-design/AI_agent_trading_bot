# AI Trading Bot — Web3 Edition: Local Setup Guide

Complete instructions to run the full stack on your local machine.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     AI Trading Bot (Web3 Edition)                    │
├────────────────────┬─────────────────┬────────────────────────────── ┤
│  React Frontend    │   Express API    │  Solidity Smart Contract      │
│  (Vite / React)    │   (Node.js)      │  (Foundry / Anvil / EVM)     │
│  Port 5173         │   Port 3001      │  Port 8545 (Anvil local)      │
│                    │                  │                               │
│  Dashboard         │  /api/trades     │  TradingLedger.sol            │
│  Trades            │  /api/portfolio  │  - recordTrade()              │
│  Chain Status      │  /api/agent      │  - getTrades()                │
│  Agent Control     │  /api/chain      │  - getCumulativePnl()         │
└────────────────────┴─────────────────┴───────────────────────────────┘
          │                    │                      │
          │         PostgreSQL │                      │ ethers.js (optional)
          │              (DB)  │                      │
          └────────────────────┘
```

---

## Prerequisites

### 1. Node.js 18+ & pnpm
```bash
# Install pnpm (if not installed)
npm install -g pnpm

# Verify
node --version   # >= 18
pnpm --version   # >= 8
```

### 2. PostgreSQL
```bash
# macOS (Homebrew)
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database
createdb trading_bot_dev
```

### 3. Foundry (for smart contracts)
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify
forge --version
anvil --version
cast --version
```

---

## Clone & Install

```bash
# Clone from GitHub
git clone https://github.com/bhavyajain0718-design/AI_agent_trading_bot.git
cd AI_agent_trading_bot

# Install all workspace dependencies
pnpm install
```

---

## Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_bot_dev
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=trading_bot_dev

# ─── API Server ───────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
SESSION_SECRET=your-super-secret-session-key-change-in-production

# ─── Web3 / Smart Contract ────────────────────────────────────────────────────
# Leave empty to run without on-chain features (still shows mock status)
# Fill in after deploying the smart contract (Step 4 below)
CONTRACT_ADDRESS=
RPC_URL=http://127.0.0.1:8545
CHAIN_NETWORK=anvil-local
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# ─── Kraken API (optional — for live trading) ────────────────────────────────
# KRAKEN_API_KEY=your_kraken_api_key
# KRAKEN_API_SECRET=your_kraken_api_secret
```

---

## Step 1: Push Database Schema

```bash
pnpm --filter @workspace/db run push
```

This creates the `trades` and `agent_decisions` tables.

If you get column-conflict errors:
```bash
pnpm --filter @workspace/db run push-force
```

---

## Step 2: Start the API Server

```bash
pnpm --filter @workspace/api-server run dev
```

The API server will start on **http://localhost:3001/api**

Test it:
```bash
curl http://localhost:3001/api/healthz
# → {"status":"ok"}

curl http://localhost:3001/api/portfolio/summary
# → {"totalValue":"10000.00","totalPnl":...}
```

---

## Step 3: Start the Frontend

Open a new terminal:

```bash
# Set PORT and BASE_PATH for Vite
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trading-dashboard run dev
```

Open **http://localhost:5173** in your browser.

---

## Step 4: Deploy the Smart Contract (Web3 Layer)

### Option A — Local Anvil (recommended for development)

**Terminal 3:** Start a local EVM node
```bash
anvil
```
This launches a local Ethereum node at `http://127.0.0.1:8545` with 10 pre-funded accounts.
Note the first private key printed (starts with `0xac0974bec39a...`).

**Terminal 4:** Deploy the contract
```bash
cd contracts
forge build
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Copy the deployed address from the output:
```
TradingLedger deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Update your `.env`:
```env
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
RPC_URL=http://127.0.0.1:8545
CHAIN_NETWORK=anvil-local
```

Restart the API server (Ctrl+C then re-run Step 2).

### Option B — Sepolia Testnet

1. Get testnet ETH from a faucet (https://sepoliafaucet.com/)
2. Set env vars:
   ```env
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
   DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
   ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
   ```
3. Deploy:
   ```bash
   cd contracts
   forge script script/Deploy.s.sol \
     --rpc-url $SEPOLIA_RPC_URL \
     --broadcast \
     --verify \
     --private-key $DEPLOYER_PRIVATE_KEY
   ```

---

## Step 5: Test On-Chain Settlement

Use the API to settle a trade on-chain:

```bash
# Create a trade
curl -X POST http://localhost:3001/api/trades \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTC/USD","side":"buy","price":"68000","quantity":"0.01","strategy":"momentum","confidence":0.78}'

# Settle it on-chain (use the ID returned above, e.g. id=1)
curl -X POST http://localhost:3001/api/trades/1/settle \
  -H "Content-Type: application/json" \
  -d '{"pnl":"127.50","walletAddress":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","chainTxHash":"0xABC..."}'

# Check on-chain P&L
curl http://localhost:3001/api/chain/on-chain-pnl
```

---

## Running Tests

### Smart Contract Tests (Foundry)

```bash
cd contracts
forge test -vv
```

Expected output:
```
Running 9 tests for test/TradingLedger.t.sol:TradingLedgerTest
[PASS] test_getTrade() (gas: ...)
[PASS] test_getTradesNewestFirst() (gas: ...)
...
All tests passed
```

### TypeScript Typecheck

```bash
pnpm run typecheck
```

---

## Full Development Stack (all in one)

Run these in separate terminals:

| Terminal | Command | Purpose |
|---|---|---|
| 1 | `anvil` | Local EVM node (port 8545) |
| 2 | `pnpm --filter @workspace/api-server run dev` | API server (port 3001) |
| 3 | `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trading-dashboard run dev` | Frontend (port 5173) |
| 4 | _(deploy contract once)_ | Smart contract on Anvil |

---

## Project Structure

```
AI_agent_trading_bot/
├── artifacts/
│   ├── api-server/           # Express API server
│   │   └── src/routes/
│   │       ├── trades.ts     # Trade CRUD + on-chain settle
│   │       ├── portfolio.ts  # P&L summary + history
│   │       ├── agent.ts      # AI agent decisions + status
│   │       └── chain.ts      # Web3 / contract status
│   └── trading-dashboard/    # React + Vite frontend
│       └── src/
├── contracts/                # Solidity smart contracts (Foundry)
│   ├── src/
│   │   └── TradingLedger.sol # Main contract
│   ├── test/
│   │   └── TradingLedger.t.sol
│   ├── script/
│   │   └── Deploy.s.sol      # Deployment script
│   └── foundry.toml
├── lib/
│   ├── api-spec/             # OpenAPI 3.1 spec
│   ├── api-client-react/     # Generated React Query hooks
│   ├── api-zod/              # Generated Zod validation schemas
│   └── db/                   # Drizzle ORM schema + DB connection
└── LOCAL-RUN-GUIDE.md        # This file
```

---

## API Endpoints Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/healthz` | Health check |
| GET | `/api/trades` | List trades |
| POST | `/api/trades` | Create trade |
| GET | `/api/trades/:id` | Get single trade |
| POST | `/api/trades/:id/settle` | Settle trade on-chain |
| GET | `/api/portfolio/summary` | Portfolio stats |
| GET | `/api/portfolio/pnl` | P&L history |
| GET | `/api/agent/decisions` | Recent AI decisions |
| POST | `/api/agent/decisions` | Record decision |
| GET | `/api/agent/status` | Agent status |
| GET | `/api/chain/status` | Chain connection status |
| GET | `/api/chain/on-chain-pnl` | On-chain P&L from contract |
| GET | `/api/chain/on-chain-trades` | On-chain trade history |

---

## Smart Contract ABI (key functions)

```solidity
// Record a settled trade (agent wallet only)
function recordTrade(
    string calldata symbol,    // e.g. "BTC/USD"
    string calldata side,      // "buy" or "sell"
    int256 price,              // price × 1e8
    int256 quantity,           // quantity × 1e8
    int256 pnl                 // P&L × 1e8 (negative = loss)
) external returns (uint256 id)

// Read functions
function getTrade(uint256 id) external view returns (Trade memory)
function getTrades(uint256 offset, uint256 limit) external view returns (Trade[] memory)
function tradeCount() external view returns (uint256)
function getCumulativePnl() external view returns (int256)
function totalPnl() external view returns (int256)

// Admin
function setAgent(address agent, bool authorized) external
function transferOwnership(address newOwner) external
```

---

## Troubleshooting

**"PORT environment variable is required"**
→ Always set `PORT` before running Vite: `PORT=5173 BASE_PATH=/ pnpm ...`

**"DATABASE_URL must be set"**
→ Make sure your `.env` file has `DATABASE_URL` set and the API server can read it.

**Forge command not found**
→ Run `foundryup` to install/update Foundry tools.

**Contract deploy fails on Anvil**
→ Make sure Anvil is running in another terminal: `anvil`

**On-chain settlement shows "not connected"**
→ Set `CONTRACT_ADDRESS` in `.env` after deploying the contract, then restart the API server.
