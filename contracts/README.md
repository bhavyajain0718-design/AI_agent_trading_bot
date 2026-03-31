# TradingLedger Smart Contract

Solidity smart contract for on-chain trade settlement and P&L recording.

## Prerequisites

Install [Foundry](https://getfoundry.sh/):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Build

```bash
cd contracts
forge build
```

## Test

```bash
cd contracts
forge test -vv
```

## Deploy to local Anvil

```bash
# Terminal 1: Start local EVM node
anvil

# Terminal 2: Deploy the contract
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Copy the deployed contract address and set it in your `.env`:
```
CONTRACT_ADDRESS=0x...
```

## Deploy to Sepolia Testnet

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --private-key $DEPLOYER_PRIVATE_KEY
```

## Contract ABI

The ABI is generated at `contracts/out/TradingLedger.sol/TradingLedger.json` after `forge build`.

## Key Functions

| Function | Description |
|---|---|
| `recordTrade(symbol, side, price, qty, pnl)` | Record a settled trade (agent only) |
| `getTrade(id)` | Get a single trade by ID |
| `getTrades(offset, limit)` | Paginate trades (newest first) |
| `tradeCount()` | Total number of recorded trades |
| `totalPnl()` | Cumulative P&L (× 1e8) |
| `setAgent(address, bool)` | Authorize/revoke agent (owner only) |

All price/quantity/P&L values are scaled by **1e8** to avoid floating point issues.
