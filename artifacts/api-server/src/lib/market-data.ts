import { z } from "zod";

const KRAKEN_API_BASE = "https://api.kraken.com/0/public";
const ASSET_PAIRS_CACHE_TTL_MS = 15 * 60_000;
const TICKER_CACHE_TTL_MS = 1000;
const MIN_EXECUTION_CONFIDENCE = Number(process.env.EXECUTION_CONFIDENCE_THRESHOLD ?? "0.6");

export const MARKET_TIMEFRAMES = {
  "5m": { label: "5M", fetchIntervalMinutes: 5, displayMinutes: 5, aggregationSize: 1 },
  "10m": { label: "10M", fetchIntervalMinutes: 5, displayMinutes: 10, aggregationSize: 2 },
  "30m": { label: "30M", fetchIntervalMinutes: 30, displayMinutes: 30, aggregationSize: 1 },
  "1h": { label: "1H", fetchIntervalMinutes: 60, displayMinutes: 60, aggregationSize: 1 },
  "1d": { label: "1D", fetchIntervalMinutes: 1440, displayMinutes: 1440, aggregationSize: 1 },
} as const;

export type MarketTimeframeKey = keyof typeof MARKET_TIMEFRAMES;

export const TRACKED_MARKETS = [
  { symbol: "BTC/USD", krakenPair: "XBTUSD", aliases: ["BTC/USD", "XBT/USD", "XXBTZUSD"] },
  { symbol: "ETH/USD", krakenPair: "ETHUSD", aliases: ["ETH/USD", "XETHZUSD"] },
  { symbol: "SOL/USD", krakenPair: "SOLUSD", aliases: ["SOL/USD", "SOLUSD"] },
  { symbol: "AVAX/USD", krakenPair: "AVAXUSD", aliases: ["AVAX/USD", "AVAXUSD"] },
  { symbol: "LINK/USD", krakenPair: "LINKUSD", aliases: ["LINK/USD", "LINKUSD"] },
] as const;

export type MarketSymbol = (typeof TRACKED_MARKETS)[number]["symbol"];

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  vwap: number;
  volume: number;
  count: number;
};

type DecisionSummary = {
  action: "buy" | "sell" | "hold";
  signalLabel: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";
  score: number;
  confidence: number;
  executed: boolean;
  reasoning: string;
  indicators: string;
  currentPrice: number;
};

export type MarketSnapshot = {
  symbol: MarketSymbol;
  krakenPair: string;
  timeframe: MarketTimeframeKey;
  price: number;
  change24h: number;
  candles: Candle[];
  latestCandle: Candle;
  decision: DecisionSummary;
};

const ohlcResponseSchema = z.object({
  error: z.array(z.string()),
  result: z.record(z.string(), z.unknown()),
});

const tickerResponseSchema = z.object({
  error: z.array(z.string()),
  result: z.record(
    z.string(),
    z.object({
      c: z.array(z.string()).optional(),
    }),
  ),
});

const assetPairsResponseSchema = z.object({
  error: z.array(z.string()),
  result: z.record(
    z.string(),
    z.object({
      altname: z.string().optional(),
      wsname: z.string().optional(),
      base: z.string().optional(),
      quote: z.string().optional(),
    }),
  ),
});

type AssetPairInfo = {
  restKey: string;
  altname?: string;
  wsname?: string;
  base?: string;
  quote?: string;
};

let assetPairsCache: { expiresAt: number; pairs: AssetPairInfo[] } | null = null;
let assetPairsInflight: Promise<AssetPairInfo[]> | null = null;
const tickerCache = new Map<string, { expiresAt: number; price: number }>();

function getTrackedMarket(symbol: string | undefined) {
  return TRACKED_MARKETS.find((market) => market.symbol === symbol) ?? TRACKED_MARKETS[0];
}

export function normalizeTimeframe(timeframe: string | undefined): MarketTimeframeKey {
  if (timeframe && timeframe in MARKET_TIMEFRAMES) {
    return timeframe as MarketTimeframeKey;
  }

  return "1h";
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Number.NaN;
}

function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((row) => {
      if (!Array.isArray(row) || row.length < 8) {
        return null;
      }

      const candle: Candle = {
        time: toFiniteNumber(row[0]),
        open: toFiniteNumber(row[1]),
        high: toFiniteNumber(row[2]),
        low: toFiniteNumber(row[3]),
        close: toFiniteNumber(row[4]),
        vwap: toFiniteNumber(row[5]),
        volume: toFiniteNumber(row[6]),
        count: toFiniteNumber(row[7]),
      };

      return Object.values(candle).every((value) => Number.isFinite(value)) ? candle : null;
    })
    .filter((candle): candle is Candle => candle !== null);
}

function aggregateCandles(candles: Candle[], aggregationSize: number): Candle[] {
  if (aggregationSize <= 1) {
    return candles;
  }

  const aggregated: Candle[] = [];

  for (let index = 0; index + aggregationSize <= candles.length; index += aggregationSize) {
    const chunk = candles.slice(index, index + aggregationSize);
    const open = chunk[0];
    const close = chunk[chunk.length - 1];
    const volume = chunk.reduce((sum, candle) => sum + candle.volume, 0);
    const tradeCount = chunk.reduce((sum, candle) => sum + candle.count, 0);
    const vwapVolume = chunk.reduce((sum, candle) => sum + candle.vwap * candle.volume, 0);

    aggregated.push({
      time: open.time,
      open: open.open,
      high: Math.max(...chunk.map((candle) => candle.high)),
      low: Math.min(...chunk.map((candle) => candle.low)),
      close: close.close,
      vwap: volume > 0 ? vwapVolume / volume : close.close,
      volume,
      count: tradeCount,
    });
  }

  return aggregated;
}

async function fetchKrakenOhlc(krakenPair: string, timeframe: MarketTimeframeKey): Promise<Candle[]> {
  const timeframeConfig = MARKET_TIMEFRAMES[timeframe];
  const url = new URL(`${KRAKEN_API_BASE}/OHLC`);
  url.searchParams.set("pair", krakenPair);
  url.searchParams.set("interval", String(timeframeConfig.fetchIntervalMinutes));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kraken OHLC request failed with ${response.status}`);
  }

  const parsed = ohlcResponseSchema.parse(await response.json());
  if (parsed.error.length > 0) {
    throw new Error(`Kraken OHLC error: ${parsed.error.join(", ")}`);
  }

  const resultEntries = Object.entries(parsed.result).filter(([key]) => key !== "last");
  const [, rawCandles] = resultEntries[0] ?? [];
  const candles = aggregateCandles(parseCandles(rawCandles), timeframeConfig.aggregationSize);

  // Kraken includes the in-progress candle as the last entry; we only score completed candles.
  return candles.slice(0, -1);
}

async function fetchKrakenTickerPrice(pair: string): Promise<number> {
  const cached = tickerCache.get(pair);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.price;
  }

  const url = new URL(`${KRAKEN_API_BASE}/Ticker`);
  url.searchParams.set("pair", pair);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Kraken Ticker request failed with ${response.status}`);
  }

  const parsed = tickerResponseSchema.parse(await response.json());
  if (parsed.error.length > 0) {
    throw new Error(`Kraken Ticker error: ${parsed.error.join(", ")}`);
  }

  const ticker = Object.values(parsed.result)[0];
  const price = toFiniteNumber(ticker?.c?.[0]);
  if (!Number.isFinite(price)) {
    throw new Error(`Kraken Ticker returned invalid price for ${pair}`);
  }

  tickerCache.set(pair, {
    expiresAt: Date.now() + TICKER_CACHE_TTL_MS,
    price,
  });

  return price;
}

async function fetchKrakenAssetPairs(): Promise<AssetPairInfo[]> {
  const now = Date.now();
  if (assetPairsCache && assetPairsCache.expiresAt > now) {
    return assetPairsCache.pairs;
  }

  if (assetPairsInflight) {
    return assetPairsInflight;
  }

  assetPairsInflight = (async () => {
    const response = await fetch(`${KRAKEN_API_BASE}/AssetPairs`);
    if (!response.ok) {
      throw new Error(`Kraken AssetPairs request failed with ${response.status}`);
    }

    const parsed = assetPairsResponseSchema.parse(await response.json());
    if (parsed.error.length > 0) {
      throw new Error(`Kraken AssetPairs error: ${parsed.error.join(", ")}`);
    }

    const pairs = Object.entries(parsed.result).map(([restKey, value]) => ({
      restKey,
      altname: value.altname,
      wsname: value.wsname,
      base: value.base,
      quote: value.quote,
    }));

    assetPairsCache = {
      expiresAt: now + ASSET_PAIRS_CACHE_TTL_MS,
      pairs,
    };
    assetPairsInflight = null;

    return pairs;
  })().catch((error) => {
    assetPairsInflight = null;
    throw error;
  });

  return assetPairsInflight;
}

async function resolveKrakenPairCandidates(
  market: (typeof TRACKED_MARKETS)[number],
): Promise<string[]> {
  const symbolForms = new Set<string>([market.krakenPair, market.symbol, ...market.aliases]);

  try {
    const assetPairs = await fetchKrakenAssetPairs();
    const [base, quote] = market.symbol.split("/");

    for (const pair of assetPairs) {
      if (
        pair.restKey === market.krakenPair ||
        pair.altname === market.krakenPair ||
        pair.wsname === market.symbol ||
        pair.altname === market.symbol ||
        pair.wsname === `${base}/${quote}` ||
        pair.altname === `${base}${quote}`
      ) {
        symbolForms.add(pair.restKey);
        if (pair.altname) {
          symbolForms.add(pair.altname);
        }
        if (pair.wsname) {
          symbolForms.add(pair.wsname);
        }
      }
    }
  } catch {
    // If metadata lookup fails, keep the static fallback aliases.
  }

  return [...symbolForms];
}

async function fetchMarketCandles(
  market: (typeof TRACKED_MARKETS)[number],
  timeframe: MarketTimeframeKey,
) {
  const candidates = await resolveKrakenPairCandidates(market);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const candles = await fetchKrakenOhlc(candidate, timeframe);
      if (candles.length >= 60) {
        return { candles, resolvedPair: candidate };
      }
      errors.push(`${candidate}: insufficient candles (${candles.length})`);
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  throw new Error(`Unable to load Kraken candles for ${market.symbol}. ${errors.join(" | ")}`);
}

export async function getLiveMarketPrice(
  symbol: string,
  timeframe: MarketTimeframeKey = "1h",
): Promise<number> {
  const market = getTrackedMarket(symbol);
  const candidates = await resolveKrakenPairCandidates(market);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return await fetchKrakenTickerPrice(candidate);
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  const snapshot = await getMarketSnapshot(market.symbol, timeframe);
  if (Number.isFinite(snapshot.price)) {
    return snapshot.price;
  }

  throw new Error(`Unable to load live Kraken price for ${symbol}. ${errors.join(" | ")}`);
}

function calculateEma(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const seedLength = Math.min(period, values.length);
  const seed = values.slice(0, seedLength).reduce((sum, value) => sum + value, 0) / seedLength;
  const emaValues = new Array<number>(values.length).fill(seed);
  emaValues[seedLength - 1] = seed;

  for (let index = seedLength; index < values.length; index += 1) {
    emaValues[index] = (values[index] - emaValues[index - 1]) * multiplier + emaValues[index - 1];
  }

  for (let index = 0; index < seedLength - 1; index += 1) {
    emaValues[index] = seed;
  }

  return emaValues;
}

function calculateRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) {
    return 50;
  }

  let gains = 0;
  let losses = 0;
  for (let index = closes.length - period; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function calculateMacd(closes: number[]) {
  const ema12 = calculateEma(closes, 12);
  const ema26 = calculateEma(closes, 26);
  const macdLine = closes.map((_, index) => ema12[index] - ema26[index]);
  const signalLine = calculateEma(macdLine, 9);
  const histogram = macdLine.map((value, index) => value - signalLine[index]);

  return {
    macd: macdLine[macdLine.length - 1] ?? 0,
    previousMacd: macdLine[macdLine.length - 2] ?? 0,
    signal: signalLine[signalLine.length - 1] ?? 0,
    previousSignal: signalLine[signalLine.length - 2] ?? 0,
    histogram: histogram[histogram.length - 1] ?? 0,
    previousHistogram: histogram[histogram.length - 2] ?? 0,
  };
}

function calculateBollinger(closes: number[], period = 20, deviations = 2) {
  const slice = closes.slice(-period);
  const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const variance =
    slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    middle: mean,
    upper: mean + deviations * standardDeviation,
    lower: mean - deviations * standardDeviation,
  };
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function scoreDecision(candles: Candle[]) {
  if (candles.length < 60) {
    throw new Error("At least 60 completed candles are required.");
  }

  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const latestPrice = closes[closes.length - 1];

  const rsi = calculateRsi(closes, 14);
  const ema20Series = calculateEma(closes, 20);
  const ema50Series = calculateEma(closes, 50);
  const ema20 = ema20Series[ema20Series.length - 1] ?? latestPrice;
  const ema50 = ema50Series[ema50Series.length - 1] ?? latestPrice;
  const macd = calculateMacd(closes);
  const bollinger = calculateBollinger(closes, 20, 2);

  let score = 0;
  const reasons: string[] = [];
  const indicatorParts: string[] = [];

  if (rsi < 30) {
    score += 2;
    reasons.push(`RSI ${rsi.toFixed(1)} is oversold (+2)`);
  } else if (rsi < 45) {
    score += 1;
    reasons.push(`RSI ${rsi.toFixed(1)} is mildly weak (+1)`);
  } else if (rsi <= 70 && rsi > 55) {
    score -= 1;
    reasons.push(`RSI ${rsi.toFixed(1)} is mildly strong (-1)`);
  } else if (rsi > 70) {
    score -= 2;
    reasons.push(`RSI ${rsi.toFixed(1)} is overbought (-2)`);
  } else {
    reasons.push(`RSI ${rsi.toFixed(1)} is neutral (+0)`);
  }
  indicatorParts.push(`RSI=${rsi.toFixed(2)}`);

  if (macd.macd > macd.signal) {
    score += 1;
    reasons.push(`MACD line is above signal (+1)`);
  } else if (macd.macd < macd.signal) {
    score -= 1;
    reasons.push(`MACD line is below signal (-1)`);
  }

  const macdStrengthThreshold = Math.abs(macd.macd) * 0.1;
  if (macd.histogram > 0 && macd.histogram > macd.previousHistogram && Math.abs(macd.histogram) > macdStrengthThreshold) {
    score += 1;
    reasons.push(`MACD histogram is expanding positively (+1)`);
  } else if (
    macd.histogram < 0 &&
    macd.histogram < macd.previousHistogram &&
    Math.abs(macd.histogram) > macdStrengthThreshold
  ) {
    score -= 1;
    reasons.push(`MACD histogram is expanding negatively (-1)`);
  } else {
    reasons.push(`MACD histogram is not decisive (+0)`);
  }
  indicatorParts.push(
    `MACD=${macd.macd.toFixed(2)}/${macd.signal.toFixed(2)} hist=${macd.histogram.toFixed(2)}`,
  );

  if (ema20 > ema50) {
    score += 1;
    reasons.push(`EMA20 is above EMA50 (+1)`);
  } else if (ema20 < ema50) {
    score -= 1;
    reasons.push(`EMA20 is below EMA50 (-1)`);
  }
  indicatorParts.push(`EMA20=${ema20.toFixed(2)} EMA50=${ema50.toFixed(2)}`);

  if (latestPrice <= bollinger.lower) {
    score += 1;
    reasons.push(`Price is at or below the lower Bollinger band (+1)`);
  } else if (latestPrice >= bollinger.upper) {
    score -= 1;
    reasons.push(`Price is at or above the upper Bollinger band (-1)`);
  } else {
    reasons.push(`Price is inside Bollinger bands (+0)`);
  }
  indicatorParts.push(
    `BB=${bollinger.lower.toFixed(2)}|${bollinger.middle.toFixed(2)}|${bollinger.upper.toFixed(2)}`,
  );

  const latestVolume = volumes[volumes.length - 1] ?? 0;
  const averageVolume10 =
    volumes.slice(-10).reduce((sum, volume) => sum + volume, 0) / Math.min(volumes.length, 10);
  if (averageVolume10 > 0 && latestVolume >= averageVolume10 * 1.5) {
    if (score > 0) {
      score += 1;
      reasons.push(`Volume is 1.5x above the 10-hour average and confirms bullish conviction (+1)`);
    } else if (score < 0) {
      score -= 1;
      reasons.push(`Volume is 1.5x above the 10-hour average and confirms bearish conviction (-1)`);
    } else {
      reasons.push(`Volume spike detected but score is neutral (+0)`);
    }
  } else {
    reasons.push(`Volume is not amplified (+0)`);
  }
  indicatorParts.push(`VOL=${latestVolume.toFixed(2)} avg10=${averageVolume10.toFixed(2)}`);

  let action: "buy" | "sell" | "hold" = "hold";
  let signalLabel: DecisionSummary["signalLabel"] = "NEUTRAL";
  let confidence = 0.5;

  if (score >= 4) {
    action = "buy";
    signalLabel = "STRONG BUY";
    confidence = Math.min(1, 0.85 + Math.max(0, score - 4) * 0.075);
  } else if (score >= 2) {
    action = "buy";
    signalLabel = "BUY";
    confidence = score === 2 ? 0.6 : 0.75;
  } else if (score <= -4) {
    action = "sell";
    signalLabel = "STRONG SELL";
    confidence = Math.min(1, 0.85 + Math.max(0, Math.abs(score) - 4) * 0.075);
  } else if (score <= -2) {
    action = "sell";
    signalLabel = "SELL";
    confidence = Math.abs(score) === 2 ? 0.6 : 0.75;
  }

  const shouldExecute = confidence >= MIN_EXECUTION_CONFIDENCE && action !== "hold";
  const reasoning = `${signalLabel} with score ${score}. ${reasons.join("; ")}.`;

  return {
    action,
    signalLabel,
    score,
    confidence,
    executed: shouldExecute,
    reasoning,
    indicators: indicatorParts.join(" | "),
    currentPrice: latestPrice,
  };
}

export async function getMarketSnapshot(
  symbol?: string,
  timeframe: MarketTimeframeKey = "1h",
): Promise<MarketSnapshot> {
  const market = getTrackedMarket(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  const timeframeConfig = MARKET_TIMEFRAMES[normalizedTimeframe];
  const { candles, resolvedPair } = await fetchMarketCandles(market, normalizedTimeframe);
  const recentCandles = candles.slice(-60);
  const latestCandle = recentCandles[recentCandles.length - 1];
  const periodsPerDay = Math.max(1, Math.round(1440 / timeframeConfig.displayMinutes));
  const dayAgoCandle = recentCandles[recentCandles.length - periodsPerDay] ?? recentCandles[0];
  const decision = scoreDecision(recentCandles);
  const livePrice = await getLiveMarketPrice(market.symbol, normalizedTimeframe).catch(() => latestCandle.close);
  const change24h = ((livePrice - dayAgoCandle.close) / dayAgoCandle.close) * 100;

  return {
    symbol: market.symbol,
    krakenPair: resolvedPair,
    timeframe: normalizedTimeframe,
    price: livePrice,
    change24h,
    candles: recentCandles,
    latestCandle,
    decision,
  };
}

export async function getAllMarketSnapshots(timeframe: MarketTimeframeKey = "1h") {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  const settled = await Promise.allSettled(
    TRACKED_MARKETS.map((market) => getMarketSnapshot(market.symbol, normalizedTimeframe)),
  );

  const snapshots = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  return snapshots.map((snapshot) => ({
    ...snapshot,
    changeLabel: formatPercent(snapshot.change24h),
  }));
}
