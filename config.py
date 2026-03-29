import os
from dotenv import load_dotenv

load_dotenv()

# ── Kraken ─────────────────────────────────────────────────────────────────────
KRAKEN_API_KEY        = os.getenv("KRAKEN_API_KEY", "")
KRAKEN_API_SECRET     = os.getenv("KRAKEN_API_SECRET", "")
KRAKEN_CLI_PATH       = os.getenv("KRAKEN_CLI_PATH", "kraken")

# ── Anthropic Claude AI Brain ──────────────────────────────────────────────────
ANTHROPIC_API_KEY     = os.getenv("ANTHROPIC_API_KEY", "")

# ── Trading Parameters ─────────────────────────────────────────────────────────
TRADING_PAIRS         = os.getenv("TRADING_PAIRS", "XBTUSD,ETHUSD").split(",")
MAX_POSITION_USD      = float(os.getenv("MAX_POSITION_USD", "500"))
MAX_DAILY_LOSS_USD    = float(os.getenv("MAX_DAILY_LOSS_USD", "100"))
MAX_DRAWDOWN_PCT      = float(os.getenv("MAX_DRAWDOWN_PCT", "0.05"))
RISK_PER_TRADE_PCT    = float(os.getenv("RISK_PER_TRADE_PCT", "0.02"))
MIN_CONFIDENCE        = float(os.getenv("MIN_CONFIDENCE", "0.65"))
LOOP_INTERVAL_SEC     = int(os.getenv("LOOP_INTERVAL_SEC", "60"))
PAPER_TRADING         = os.getenv("PAPER_TRADING", "true").lower() == "true"
STARTING_CAPITAL_USD  = float(os.getenv("STARTING_CAPITAL_USD", "10000"))

# ── ERC-8004 / On-chain ────────────────────────────────────────────────────────
AGENT_WALLET_ADDRESS      = os.getenv("AGENT_WALLET_ADDRESS", "")
AGENT_PRIVATE_KEY         = os.getenv("AGENT_PRIVATE_KEY", "")
RPC_URL                   = os.getenv("RPC_URL", "https://sepolia.base.org")
CHAIN_ID                  = int(os.getenv("CHAIN_ID", "84532"))

IDENTITY_REGISTRY_ADDR    = os.getenv("IDENTITY_REGISTRY_ADDR", "")
REPUTATION_REGISTRY_ADDR  = os.getenv("REPUTATION_REGISTRY_ADDR", "")
VALIDATION_REGISTRY_ADDR  = os.getenv("VALIDATION_REGISTRY_ADDR", "")