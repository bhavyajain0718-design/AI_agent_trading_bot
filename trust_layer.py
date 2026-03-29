"""
erc8004/trust_layer.py
On-chain ERC-8004 integration — identity, reputation, and validation.
Handles:
  - Agent identity registration (ERC-721 minting)
  - EIP-712 signed TradeIntents
  - Trade outcome reputation updates
  - Validation artifact emission
Gracefully degrades if contracts are not yet deployed.
"""

import asyncio
import hashlib
import json
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Minimal ABIs — only the functions we actually call
IDENTITY_ABI = [
    {
        "inputs": [
            {"name": "agentWallet", "type": "address"},
            {"name": "metadataURI",  "type": "string"},
        ],
        "name": "registerAgent",
        "outputs": [{"name": "tokenId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "agentWallet", "type": "address"}],
        "name": "isRegistered",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]

REPUTATION_ABI = [
    {
        "inputs": [
            {"name": "agentId",    "type": "uint256"},
            {"name": "pnlBps",     "type": "int256"},   # PnL in basis points
            {"name": "tradeHash",  "type": "bytes32"},
        ],
        "name": "recordOutcome",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "getReputation",
        "outputs": [
            {"name": "score",      "type": "uint256"},
            {"name": "tradeCount", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

VALIDATION_ABI = [
    {
        "inputs": [
            {"name": "agentId",    "type": "uint256"},
            {"name": "intentHash", "type": "bytes32"},
            {"name": "checkType",  "type": "string"},
            {"name": "passed",     "type": "bool"},
        ],
        "name": "recordValidation",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

# EIP-712 domain + TradeIntent type hash
EIP712_DOMAIN = {
    "name":    "PRISMTradingAgent",
    "version": "1",
}

TRADE_INTENT_TYPES = {
    "TradeIntent": [
        {"name": "pair",       "type": "string"},
        {"name": "action",     "type": "string"},
        {"name": "price",      "type": "uint256"},
        {"name": "confidence", "type": "uint256"},
        {"name": "timestamp",  "type": "uint256"},
        {"name": "agentId",    "type": "uint256"},
    ]
}


class TrustLayer:
    """
    ERC-8004 on-chain trust interface.
    If web3 / contracts are unavailable, logs locally and continues —
    the trading agent never blocks on chain operations.
    """

    def __init__(self, wallet_address: str, private_key: str,
                 rpc_url: str, chain_id: int,
                 identity_addr: str, reputation_addr: str, validation_addr: str):
        self.wallet_address  = wallet_address
        self.private_key     = private_key
        self.chain_id        = chain_id
        self.agent_id:  Optional[int] = None
        self.registered      = False

        self._w3              = None
        self._identity        = None
        self._reputation      = None
        self._validation      = None
        self._local_log: list = []   # fallback when chain is unavailable

        self._init_web3(rpc_url, identity_addr, reputation_addr, validation_addr)

    def _init_web3(self, rpc_url, id_addr, rep_addr, val_addr):
        try:
            from web3 import Web3
            from web3.middleware import ExtraDataToPOAMiddleware
            w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10}))
            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            self._w3 = w3

            if id_addr:
                self._identity   = w3.eth.contract(address=Web3.to_checksum_address(id_addr), abi=IDENTITY_ABI)
            if rep_addr:
                self._reputation = w3.eth.contract(address=Web3.to_checksum_address(rep_addr), abi=REPUTATION_ABI)
            if val_addr:
                self._validation = w3.eth.contract(address=Web3.to_checksum_address(val_addr), abi=VALIDATION_ABI)

            logger.info("Web3 connected: chain=%d", w3.eth.chain_id)
        except ImportError:
            logger.warning("web3 not installed — on-chain features disabled")
        except Exception as e:
            logger.warning("Web3 init failed: %s — running in local-log mode", e)

    # ── Signing helpers ────────────────────────────────────────────────────────

    def _sign_trade_intent(self, pair: str, action: str, price: float,
                            confidence: float) -> Optional[str]:
        """Produce an EIP-712 signed TradeIntent."""
        if not self._w3 or not self.private_key:
            return None
        try:
            from eth_account import Account
            from eth_account.messages import encode_typed_data
            domain = {**EIP712_DOMAIN, "chainId": self.chain_id}
            message = {
                "pair":       pair,
                "action":     action,
                "price":      int(price * 1e8),
                "confidence": int(confidence * 1e6),
                "timestamp":  int(time.time()),
                "agentId":    self.agent_id or 0,
            }
            structured = encode_typed_data(domain, TRADE_INTENT_TYPES, message)
            signed     = Account.sign_message(structured, self.private_key)
            return signed.signature.hex()
        except Exception as e:
            logger.warning("EIP-712 signing failed: %s", e)
            return None

    def _send_tx(self, fn_call) -> Optional[str]:
        """Build, sign, and send a transaction. Returns tx hash."""
        if not self._w3 or not self.private_key or not self.wallet_address:
            return None
        try:
            from eth_account import Account
            acct   = Account.from_key(self.private_key)
            nonce  = self._w3.eth.get_transaction_count(acct.address)
            tx     = fn_call.build_transaction({
                "from":     acct.address,
                "nonce":    nonce,
                "chainId":  self.chain_id,
                "gas":      200_000,
                "gasPrice": self._w3.eth.gas_price,
            })
            signed = acct.sign_transaction(tx)
            txhash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            return txhash.hex()
        except Exception as e:
            logger.warning("TX send failed: %s", e)
            return None

    def _intent_hash(self, pair: str, action: str, price: float, ts: int) -> bytes:
        raw = f"{pair}:{action}:{price:.2f}:{ts}".encode()
        return hashlib.sha256(raw).digest()

    # ── Public API ─────────────────────────────────────────────────────────────

    async def register_agent_identity(self):
        """Mint agent identity NFT on ERC-8004 Identity Registry."""
        if self.registered:
            return
        if not self._identity or not self.wallet_address:
            logger.info("[ERC-8004] No identity contract — skipping registration")
            return

        try:
            metadata = {
                "name":         "PRISM Trading Agent",
                "description":  "Autonomous AI trading agent — AI Trading Agents Hackathon 2026",
                "capabilities": ["spot_trading", "risk_management", "ai_signals", "portfolio_optimization"],
                "strategies":   ["ema_crossover", "rsi", "bollinger_bands", "volume_momentum"],
                "wallet":       self.wallet_address,
                "version":      "1.0.0",
            }
            metadata_uri = f"data:application/json;base64," + \
                __import__("base64").b64encode(json.dumps(metadata).encode()).decode()

            tx = self._send_tx(
                self._identity.functions.registerAgent(self.wallet_address, metadata_uri)
            )
            if tx:
                self.registered = True
                logger.info("[ERC-8004] Agent registered — tx=%s", tx)
            else:
                logger.info("[ERC-8004] Registration skipped (no wallet/contracts configured)")
        except Exception as e:
            logger.warning("[ERC-8004] Registration failed: %s", e)

    async def record_trade_intent(self, pair: str, action: str,
                                   price: float, confidence: float, reasoning: str):
        """Emit a signed TradeIntent validation artifact on-chain."""
        ts   = int(time.time())
        sig  = self._sign_trade_intent(pair, action, price, confidence)
        h    = self._intent_hash(pair, action, price, ts)

        record = {
            "type":       "trade_intent",
            "pair":       pair,
            "action":     action,
            "price":      price,
            "confidence": confidence,
            "reasoning":  reasoning,
            "timestamp":  ts,
            "signature":  sig,
            "hash":       h.hex(),
        }
        self._local_log.append(record)

        if self._validation and self.agent_id:
            try:
                tx = self._send_tx(
                    self._validation.functions.recordValidation(
                        self.agent_id, h, "TRADE_INTENT", True
                    )
                )
                if tx:
                    logger.debug("[ERC-8004] TradeIntent recorded tx=%s", tx)
            except Exception as e:
                logger.debug("[ERC-8004] TradeIntent tx failed: %s", e)

    async def record_trade_outcome(self, pair: str, pnl_usd: float):
        """Update reputation registry with trade PnL outcome."""
        ts   = int(time.time())
        h    = self._intent_hash(pair, "outcome", pnl_usd, ts)
        bps  = int(pnl_usd * 100)   # basis points approximation

        record = {
            "type":      "trade_outcome",
            "pair":      pair,
            "pnl_usd":   pnl_usd,
            "pnl_bps":   bps,
            "timestamp": ts,
        }
        self._local_log.append(record)
        logger.info("[ERC-8004] Outcome recorded: %s PnL=$%.2f", pair, pnl_usd)

        if self._reputation and self.agent_id:
            try:
                tx = self._send_tx(
                    self._reputation.functions.recordOutcome(self.agent_id, bps, h)
                )
                if tx:
                    logger.debug("[ERC-8004] Reputation updated tx=%s", tx)
            except Exception as e:
                logger.debug("[ERC-8004] Reputation tx failed: %s", e)

    def get_local_log(self) -> list:
        return list(self._local_log)

    def reputation_summary(self) -> dict:
        outcomes = [r for r in self._local_log if r["type"] == "trade_outcome"]
        if not outcomes:
            return {"score": 0, "trades": 0, "avg_pnl": 0}
        pnls = [o["pnl_usd"] for o in outcomes]
        wins = sum(1 for p in pnls if p > 0)
        return {
            "score":   max(0, sum(pnls)),
            "trades":  len(outcomes),
            "wins":    wins,
            "avg_pnl": sum(pnls) / len(pnls),
        }