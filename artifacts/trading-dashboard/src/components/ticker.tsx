import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { fetchMarketOverview } from "@/lib/market-api";

export function Ticker() {
  const { data } = useQuery({
    queryKey: ["market-overview", "ticker"],
    queryFn: () => fetchMarketOverview(),
    refetchInterval: 30_000,
  });

  const prices = data?.tickers ?? [];

  return (
    <div className="flex-1 overflow-hidden whitespace-nowrap bg-card">
      <div className="inline-block animate-[ticker_30s_linear_infinite]">
        <div className="flex items-center gap-8 px-4 font-mono text-xs">
          {prices.map((p, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-muted-foreground">{p.symbol}</span>
              <span className="font-semibold">${p.price.toFixed(2)}</span>
              <span className={cn(
                p.change24h >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive"
              )}>
                {p.change24h > 0 ? "+" : ""}{p.change24h.toFixed(2)}%
              </span>
            </span>
          ))}
          {prices.map((p, i) => (
            <span key={`dup-${i}`} className="flex items-center gap-2">
              <span className="text-muted-foreground">{p.symbol}</span>
              <span className="font-semibold">${p.price.toFixed(2)}</span>
              <span className={cn(
                p.change24h >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive"
              )}>
                {p.change24h > 0 ? "+" : ""}{p.change24h.toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
