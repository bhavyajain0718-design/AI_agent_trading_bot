export type MarketOverviewResponse = {
  generatedAt: string;
  selectedSymbol: string;
  availableSymbols: string[];
  availableTimeframes: Array<{
    key: string;
    label: string;
  }>;
  chart: {
    symbol: string;
    timeframe: string;
    latestPrice: number;
    change24h: number;
    candles: Array<{
      time: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  };
  tickers: Array<{
    symbol: string;
    price: number;
    change24h: number;
    action: string;
    score: number;
    confidence: number;
    lastDecisionAt: string | null;
  }>;
  signals: Array<{
    id: number;
    symbol: string;
    action: string;
    confidence: number;
    price: string;
    reasoning: string;
    indicators: string;
    createdAt: string;
  }>;
};

export async function fetchMarketOverview(symbol?: string, timeframe?: string): Promise<MarketOverviewResponse> {
  const url = new URL("/api/market/overview", window.location.origin);
  if (symbol) {
    url.searchParams.set("symbol", symbol);
  }
  if (timeframe) {
    url.searchParams.set("timeframe", timeframe);
  }

  const response = await fetch(url.pathname + url.search, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch market overview");
  }

  return response.json();
}
