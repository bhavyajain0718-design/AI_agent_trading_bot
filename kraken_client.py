"""
agent/kraken_client.py
Wraps Kraken REST API for market data and Kraken CLI for order execution.
Paper trading mode fully supported — no live capital touched unless
PAPER_TRADING=false in your .env.
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import subprocess
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

BASE_URL = "https://api.kraken.com"


@dataclass
class OHLCV:
    pair:   str
    time:   int
    open:   float
    high:   float
    low:    float
    close:  float
    volume: float


@dataclass
class OrderBook:
    pair: str
    bids: List[Dict]   # [{"price": x, "volume": y}, ...]
    asks: List[Dict]


@dataclass
class TradeResult:
    order_id:  str
    pair:      str
    side:      str   # "buy" | "sell"
    volume:    float
    price:     float
    paper:     bool
    timestamp: float = field(default_factory=time.time)


class KrakenClient:
    """Async Kraken client — REST for data, CLI for execution."""

    def __init__(self, api_key: str, api_secret: str, cli_path: str = "kraken", paper: bool = True):
        self.api_key    = api_key
        self.api_secret = api_secret
        self.cli_path   = cli_path
        self.paper      = paper
        self._session: Optional[aiohttp.ClientSession] = None

    # ── Session management ─────────────────────────────────────────────────────

    async def __aenter__(self):
        self._session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *_):
        if self._session:
            await self._session.close()

    async def _session_get(self) -> aiohttp.ClientSession:
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    # ── Auth ───────────────────────────────────────────────────────────────────

    def _sign(self, urlpath: str, data: Dict) -> Dict[str, str]:
        data["nonce"] = str(int(time.time() * 1000))
        postdata      = urllib.parse.urlencode(data)
        encoded       = (data["nonce"] + postdata).encode()
        msg           = urlpath.encode() + hashlib.sha256(encoded).digest()
        mac           = hmac.new(base64.b64decode(self.api_secret), msg, hashlib.sha512)
        return {
            "API-Key":  self.api_key,
            "API-Sign": base64.b64encode(mac.digest()).decode(),
        }

    # ── Public market data ─────────────────────────────────────────────────────

    async def get_ohlcv(self, pair: str, interval: int = 60, count: int = 100) -> List[OHLCV]:
        """Fetch OHLCV candles. interval in minutes (1,5,15,30,60,240,1440)."""
        session = await self._session_get()
        url     = f"{BASE_URL}/0/public/OHLC"
        params  = {"pair": pair, "interval": interval}
        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as r:
                data = await r.json()
            if data.get("error"):
                logger.error("OHLCV error %s: %s", pair, data["error"])
                return []
            raw    = next(iter(data["result"].values()))
            candles = []
            for c in raw[-count:]:
                candles.append(OHLCV(pair, int(c[0]), float(c[1]), float(c[2]),
                                     float(c[3]), float(c[4]), float(c[6])))
            return candles
        except Exception as e:
            logger.error("get_ohlcv failed: %s", e)
            return []

    async def get_ticker(self, pair: str) -> Optional[Dict]:
        session = await self._session_get()
        url     = f"{BASE_URL}/0/public/Ticker"
        try:
            async with session.get(url, params={"pair": pair}, timeout=aiohttp.ClientTimeout(total=8)) as r:
                data = await r.json()
            if data.get("error"):
                return None
            return next(iter(data["result"].values()))
        except Exception as e:
            logger.error("get_ticker failed: %s", e)
            return None

    async def get_order_book(self, pair: str, count: int = 10) -> Optional[OrderBook]:
        session = await self._session_get()
        url     = f"{BASE_URL}/0/public/Depth"
        try:
            async with session.get(url, params={"pair": pair, "count": count},
                                   timeout=aiohttp.ClientTimeout(total=8)) as r:
                data = await r.json()
            if data.get("error"):
                return None
            book = next(iter(data["result"].values()))
            bids = [{"price": float(b[0]), "volume": float(b[1])} for b in book["bids"]]
            asks = [{"price": float(a[0]), "volume": float(a[1])} for a in book["asks"]]
            return OrderBook(pair, bids, asks)
        except Exception as e:
            logger.error("get_order_book failed: %s", e)
            return None

    async def get_recent_trades(self, pair: str) -> List[Dict]:
        session = await self._session_get()
        url     = f"{BASE_URL}/0/public/Trades"
        try:
            async with session.get(url, params={"pair": pair}, timeout=aiohttp.ClientTimeout(total=8)) as r:
                data = await r.json()
            if data.get("error"):
                return []
            raw = next(iter(data["result"].values()))
            return [{"price": float(t[0]), "volume": float(t[1]),
                     "side": "buy" if t[3] == "b" else "sell"} for t in raw]
        except Exception as e:
            logger.error("get_recent_trades failed: %s", e)
            return []

    # ── Private account data ───────────────────────────────────────────────────

    async def get_balance(self) -> Dict[str, float]:
        if self.paper:
            return {"ZUSD": 10000.0, "XXBT": 0.1, "XETH": 1.0}
        urlpath = "/0/private/Balance"
        data    = {}
        headers = self._sign(urlpath, data)
        session = await self._session_get()
        try:
            async with session.post(BASE_URL + urlpath, data=data,
                                    headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                resp = await r.json()
            return {k: float(v) for k, v in resp.get("result", {}).items()}
        except Exception as e:
            logger.error("get_balance failed: %s", e)
            return {}

    async def get_open_orders(self) -> List[Dict]:
        if self.paper:
            return []
        urlpath = "/0/private/OpenOrders"
        data    = {}
        headers = self._sign(urlpath, data)
        session = await self._session_get()
        try:
            async with session.post(BASE_URL + urlpath, data=data,
                                    headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as r:
                resp = await r.json()
            orders = resp.get("result", {}).get("open", {})
            return list(orders.values())
        except Exception as e:
            logger.error("get_open_orders failed: %s", e)
            return []

    # ── Order execution via Kraken CLI ─────────────────────────────────────────

    async def _cli(self, args: List[str]) -> Dict:
        """Call Kraken CLI binary and return parsed JSON output."""
        cmd = [self.cli_path] + args + ["--output", "json"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            if proc.returncode != 0:
                logger.error("CLI error: %s", stderr.decode())
                return {"error": stderr.decode()}
            return json.loads(stdout.decode())
        except asyncio.TimeoutError:
            logger.error("CLI timed out")
            return {"error": "timeout"}
        except Exception as e:
            logger.error("CLI failed: %s", e)
            return {"error": str(e)}

    async def place_market_order(self, pair: str, side: str, volume: float,
                                  price: float = 0.0) -> TradeResult:
        """Place a market order. In paper mode, simulates fill at current price."""
        if self.paper:
            order_id = f"PAPER-{int(time.time())}-{pair}"
            logger.info("[PAPER] %s %s %.6f @ %.2f", side.upper(), pair, volume, price)
            return TradeResult(order_id, pair, side, volume, price, paper=True)

        result = await self._cli([
            "order", "add",
            "--pair",   pair,
            "--type",   side,
            "--order-type", "market",
            "--volume", str(volume),
        ])
        if "error" in result:
            raise RuntimeError(f"Order failed: {result['error']}")

        order_id = result.get("txid", [""])[0]
        logger.info("[LIVE] %s %s %s vol=%.6f", side.upper(), pair, order_id, volume)
        return TradeResult(order_id, pair, side, volume, price, paper=False)

    async def cancel_order(self, order_id: str) -> bool:
        if self.paper:
            return True
        result = await self._cli(["order", "cancel", "--txid", order_id])
        return "error" not in result

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()