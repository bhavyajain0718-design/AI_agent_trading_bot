import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BarChart3, BrainCircuit, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchMarketOverview } from "@/lib/market-api";

function formatCompactPrice(value: number) {
  return value >= 1000 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value.toFixed(4);
}

export default function Markets() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USD");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["market-overview", selectedSymbol],
    queryFn: () => fetchMarketOverview(selectedSymbol),
    refetchInterval: 30_000,
  });

  const chartData =
    data?.chart.candles.map((candle) => ({
      time: new Date(candle.time).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
      }),
      close: candle.close,
      volume: candle.volume,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-mono font-bold tracking-tight text-foreground">Market Overview</h2>
          <p className="mt-1 font-mono text-sm uppercase tracking-wide text-muted-foreground">
            Real-time exchange data + transparent agent scoring
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(data?.availableSymbols ?? ["BTC/USD", "ETH/USD", "SOL/USD", "AVAX/USD", "LINK/USD"]).map((symbol) => (
            <Button
              key={symbol}
              variant="outline"
              size="sm"
              className={cn(
                "font-mono",
                selectedSymbol === symbol
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setSelectedSymbol(symbol)}
            >
              {symbol}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_360px]">
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="flex items-center justify-between text-lg font-mono">
              <span>{data?.chart.symbol ?? selectedSymbol} Chart</span>
              <span className="rounded border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                {data?.chart.timeframe ?? "1H"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoading ? (
              <Skeleton className="h-[420px] w-full" />
            ) : isError || !data ? (
              <div className="flex h-[420px] items-center justify-center font-mono text-sm text-destructive">
                MARKET FEED UNAVAILABLE
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-6 font-mono">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Last Price</div>
                    <div className="text-3xl font-bold text-foreground">${formatCompactPrice(data.chart.latestPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">24H Change</div>
                    <div className={cn("text-xl font-bold", data.chart.change24h >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive")}>
                      {data.chart.change24h >= 0 ? "+" : ""}
                      {data.chart.change24h.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis yAxisId="price" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} domain={["dataMin", "dataMax"]} tickFormatter={(value) => `$${formatCompactPrice(Number(value))}`} />
                      <YAxis yAxisId="volume" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(Number(value))}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                        }}
                      />
                      <Bar yAxisId="volume" dataKey="volume" fill="hsla(152, 100%, 50%, 0.25)" radius={[2, 2, 0, 0]} />
                      <Line yAxisId="price" type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Market Tickers
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {(data?.tickers ?? []).map((ticker) => (
                  <div key={ticker.symbol} className="rounded border border-border/40 bg-background/40 p-3 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{ticker.symbol}</span>
                      <span className={cn("text-sm", ticker.change24h >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive")}>
                        {ticker.change24h >= 0 ? "+" : ""}
                        {ticker.change24h.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-1 text-lg text-foreground">${formatCompactPrice(ticker.price)}</div>
                    <div className="mt-2 flex items-center justify-between text-[11px] uppercase text-muted-foreground">
                      <span>{ticker.action}</span>
                      <span>score {ticker.score}</span>
                      <span>{(ticker.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-sm font-mono uppercase text-muted-foreground">
                <BrainCircuit className="h-4 w-4 text-primary" />
                AI Market Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {(data?.signals ?? []).slice(0, 6).map((signal) => (
                  <div key={signal.id} className="rounded border border-border/40 bg-background/40 p-3 font-mono">
                    <div className="flex items-center justify-between text-xs uppercase">
                      <span className="font-bold text-foreground">{signal.symbol}</span>
                      <span className={cn(signal.action === "buy" ? "text-[hsl(152,100%,50%)]" : signal.action === "sell" ? "text-destructive" : "text-primary")}>
                        {signal.action}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {signal.reasoning}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] uppercase text-muted-foreground">
                      <span>{(signal.confidence * 100).toFixed(0)}%</span>
                      <span>${signal.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
