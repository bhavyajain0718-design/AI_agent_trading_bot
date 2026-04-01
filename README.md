# 🚀 BHAVYA_TRADE

> Autonomous AI Trading Dashboard with Web3 Settlement & Wallet-Scoped Intelligence

An advanced full-stack trading system combining **AI-driven decision making**, **real-time analytics**, and **on-chain verification** on Ethereum Sepolia.

---

## 🌟 What This Project Is

**BHAVYA_TRADE** is a modern, production-style trading platform that merges:

- 🤖 Autonomous AI trading agent  
- 📊 Real-time trading dashboard  
- 🧠 Strategy reasoning & signal logging  
- 🗄️ PostgreSQL analytics layer  
- ⛓️ Web3 smart contract settlement  
- 🔐 Wallet-scoped trading sessions  

This is not a demo — it's a **complete system design** showing how real-world AI + Web3 products can be built.

---

## 💡 Why This Project Stands Out

Most projects do **one thing well**:

- UI dashboards ❌ no trust layer  
- Smart contracts ❌ no usable product  

👉 **This does both.**

### ✅ What makes it different:

- 📡 Live market-aware trading engine  
- 🧠 Transparent AI reasoning  
- 🔐 Wallet-specific experiences  
- ⛓️ On-chain trade finalization  
- 🔎 Etherscan-verifiable records  

> ⚡ *Fast off-chain intelligence + Trustless on-chain verification*

---

## 🖼️ Screenshots

### 📊 Dashboard Preview
![Dashboard Preview](./Assets/Assets/dashboard.png)

### 📈 Markets Preview
![Markets Preview](./Assets/Assets/markets.png)

### 💼 Trades Preview
![Trades Preview](./Assets/Assets/trades.png)

### ⛓️ Web3 Settlement Preview
![Web3 Settlement Preview](./Assets/Assets/web3settlement.png)

### 🤖 Agent Control Preview
![Agent Control Preview](./Assets/Assets/Agent.png)

### 🧪 Test Coverage Preview
![Test Coverage](./Assets/Assets/test.png)

---

## 🔄 Core Product Flow

1. 🔐 User connects wallet  
2. 📡 Agent reads live Kraken market data  
3. 🧠 Strategy evaluates signals + logs reasoning  
4. 💼 Trades open and track live P&L  
5. ✅ Trade completes → finalized on-chain  
6. ⛓️ Settlement appears in Web3 page  
7. 📊 Dashboard updates stats + performance  

### 🧭 Simple Mental Model

- **Trades** → Active positions  
- **Web3 Settlement** → Completed, verified outcomes  

---

## 🧱 Tech Stack

### 🎨 Frontend
- React 19 + Vite + TypeScript  
- Tailwind + Radix UI  
- TanStack React Query  
- Recharts  
- Wouter  

### ⚙️ Backend
- Node.js + Express 5  
- TypeScript  
- Drizzle ORM  
- PostgreSQL  
- Pino logging  

### ⛓️ Web3 / Smart Contracts
- Solidity + Foundry  
- Ethereum Sepolia  
- Alchemy RPC  
- Etherscan  

### 🧩 Shared Infra
- pnpm workspaces  
- Zod schemas  
- OpenAPI contracts  
- Generated React Query client  

---

## 🏗️ Architecture

```text
AI_agent_trading_bot/
├── artifacts/
│   ├── trading-dashboard/   # Frontend
│   └── api-server/          # Backend
├── contracts/               # Solidity + Foundry
├── lib/                     # Shared typed packages
└── scripts/

🧠 What Was Built
🔐 Wallet-Scoped UX
Wallet connection unlocks the app
All data tied to user wallet
Personalized metrics & trades
🤖 Autonomous Trading Engine
Reads live crypto pairs
Executes strategy logic
Logs reasoning transparently
Opens & closes trades automatically
⚖️ Hybrid Architecture
Layer	Responsibility
Off-chain	Speed, UI, analytics
On-chain	Finalization, trust

👉 Best of both worlds.

📊 Product Surfaces
📊 Dashboard → Portfolio stats + charts
📈 Markets → Live charts + timeframes
💼 Trades → Active positions
⛓️ Web3 Settlement → Verified outcomes
🤖 Agent Control → Strategy + logs
⛓️ Smart Contract Layer

Acts as an immutable trade ledger:

✅ Finalized trade records
🔍 Public verification via Etherscan
🔐 Wallet-scoped settlement history

📁 See: contracts/README.md

🧩 Typed Monorepo Design

Instead of fragile APIs:

✅ Shared schemas (Zod)
✅ Generated clients
✅ Type-safe requests/responses
Result:
🚀 Faster development
🛡️ Fewer bugs
🔄 Safer refactors
⚙️ Local Setup
📦 Install
pnpm install
🗄️ Start Database

Ensure PostgreSQL is running.

🚀 Start Backend
cd artifacts/api-server
pnpm run dev
🎨 Start Frontend
cd artifacts/trading-dashboard
pnpm run dev

Open 👉 http://localhost:5173

⛓️ Optional: Local Blockchain
anvil
🔑 Environment Example
DATABASE_URL=postgresql://postgres:password@localhost:5432/trading_bot
PORT=3002

RPC_URL=https://eth-sepolia.g.alchemy.com/v2/KEY
CONTRACT_ADDRESS=0x...

EXECUTION_CONFIDENCE_THRESHOLD=0.6
AGENT_TIMEFRAME=5m

⚠️ Never commit private keys.

⚡ How It Works
📡 Market Data
Kraken API
Powers charts, signals, P&L
🤖 Agent Logic
Evaluates signals
Logs reasoning
Executes trades
⛓️ Settlement
Final trades → blockchain
Viewable via Etherscan
🧠 Design Philosophy

Use each system for what it’s best at:

🤖 AI → decision making
🌐 Web → user experience
⛓️ Blockchain → trust & verification
💼 Portfolio Value

This project demonstrates:

Full-stack TypeScript mastery
Real-time trading systems
Web3 integration
Smart contract engineering
Scalable architecture design
Production-grade UI
🛣️ Roadmap
📡 Live on-chain event streaming
📊 Advanced analytics
🔁 Strategy switching
📁 Exportable reports
🤖 Multi-agent support
🛠️ Troubleshooting
Port already in use
fuser -k 3002/tcp
API not reachable
Check backend running
Verify API_ORIGIN
Foundry missing
curl -L https://foundry.paradigm.xyz | bash
foundryup
📚 Additional Docs
contracts/README.md
🏁 Final Note

BHAVYA_TRADE is a demonstration of what happens when:

🤖 AI + 🎨 Frontend + ⚙️ Backend + ⛓️ Web3
are built as one cohesive product

Not separate experiments.

⭐ If you found this interesting, consider starring the repo!


---

### 🔥 What improved
- More **scannable (recruiter-friendly)**
- Stronger **visual hierarchy**
- Better **product storytelling**
- Strategic emoji use (not spammy)
- Cleaner sections + flow

---

If you want next level polish, I can:
- Add **badges (build, tech, license)**
- Add **demo GIFs**
- Add **live deployment section**
- Make it **top-tier GitHub trending quality**
