import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Mock ticker prices for the visual effect
const INITIAL_PRICES = [
  { symbol: "BTC/USD", price: 64230.50, change: 2.4 },
  { symbol: "ETH/USD", price: 3450.20, change: 1.2 },
  { symbol: "SOL/USD", price: 145.80, change: -4.5 },
  { symbol: "AVAX/USD", price: 35.40, change: 0.8 },
  { symbol: "LINK/USD", price: 15.20, change: -1.2 },
  { symbol: "DOGE/USD", price: 18.90, change: 5.4 },
];

export function Ticker() {
  const [prices, setPrices] = useState(INITIAL_PRICES);

  // Simulate price ticks
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices((prev) => 
        prev.map(p => ({
          ...p,
          price: p.price * (1 + (Math.random() * 0.002 - 0.001)),
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 overflow-hidden whitespace-nowrap bg-card">
      <div className="inline-block animate-[ticker_30s_linear_infinite]">
        <div className="flex items-center gap-8 px-4 font-mono text-xs">
          {prices.map((p, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-muted-foreground">{p.symbol}</span>
              <span className="font-semibold">${p.price.toFixed(2)}</span>
              <span className={cn(
                p.change >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive"
              )}>
                {p.change > 0 ? "+" : ""}{p.change.toFixed(2)}%
              </span>
            </span>
          ))}
          {/* Duplicate for infinite scroll */}
          {prices.map((p, i) => (
            <span key={`dup-${i}`} className="flex items-center gap-2">
              <span className="text-muted-foreground">{p.symbol}</span>
              <span className="font-semibold">${p.price.toFixed(2)}</span>
              <span className={cn(
                p.change >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive"
              )}>
                {p.change > 0 ? "+" : ""}{p.change.toFixed(2)}%
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Add this to index.css or a global style
// @keyframes ticker {
//   0% { transform: translateX(0); }
//   100% { transform: translateX(-50%); }
// }
