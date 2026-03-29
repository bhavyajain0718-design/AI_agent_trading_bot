#!/usr/bin/env python3
"""
main.py — PRISM AI Trading Agent entry point
Usage:
  python main.py           → run the full trading agent
  python main.py --dry-run → validate config and exit
"""

import argparse
import asyncio
import logging
import sys

logger = logging.getLogger(__name__)


def check_config():
    """Validate all required config before starting."""
    from config import (
        KRAKEN_API_KEY, KRAKEN_API_SECRET, ANTHROPIC_API_KEY, TRADING_PAIRS, PAPER_TRADING
    )
    errors = []
    if not PAPER_TRADING and not KRAKEN_API_KEY:
        errors.append("KRAKEN_API_KEY not set in .env")
    if not PAPER_TRADING and not KRAKEN_API_SECRET:
        errors.append("KRAKEN_API_SECRET not set in .env")
    if not ANTHROPIC_API_KEY:
        errors.append("ANTHROPIC_API_KEY not set in .env")
    if not TRADING_PAIRS:
        errors.append("TRADING_PAIRS is empty")

    if errors:
        print("\n❌ Configuration errors:")
        for e in errors:
            print(f"   • {e}")
        print("\nCopy .env.example → .env and fill in your keys.\n")
        return False

    print("\n✅ Config valid")
    print(f"   Mode:   {'PAPER' if PAPER_TRADING else 'LIVE'}")
    print(f"   Pairs:  {', '.join(TRADING_PAIRS)}")
    return True


async def main():
    parser = argparse.ArgumentParser(description="PRISM AI Trading Agent")
    parser.add_argument("--dry-run", action="store_true", help="Validate config and exit")
    args = parser.parse_args()

    if not check_config():
        sys.exit(1)

    if args.dry_run:
        print("Dry-run complete. Exiting.\n")
        return

    from agent.trading_agent import TradingAgent
    agent = TradingAgent()

    try:
        await agent.run()
    except KeyboardInterrupt:
        print("\n\n👋 Agent stopped by user")
        agent.stop()
    except Exception as e:
        logger.error("Fatal agent error: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
