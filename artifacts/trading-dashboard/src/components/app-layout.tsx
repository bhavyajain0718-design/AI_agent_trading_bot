import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, ListTree, BoxSelect, Cpu, ChartCandlestick } from "lucide-react";
import { cn } from "@/lib/utils";
import { Ticker } from "./ticker";
import { useHealthCheck } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck({ query: { refetchInterval: 15000 } });

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/markets", label: "Markets", icon: ChartCandlestick },
    { href: "/trades", label: "Trades", icon: ListTree },
    { href: "/chain", label: "Web3 Settlement", icon: BoxSelect },
    { href: "/agent", label: "Agent Control", icon: Cpu },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
      {/* Top Ticker */}
      <div className="h-8 border-b border-border/50 flex items-center bg-card">
        <div className="px-4 text-xs font-mono text-muted-foreground flex items-center gap-2 border-r border-border/50 h-full">
          <Activity className="h-3 w-3 text-primary" />
          <span>LIVE FEED</span>
        </div>
        <Ticker />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r border-border/50 bg-card/50 flex flex-col">
          <div className="p-4 border-b border-border/50">
            <h1 className="font-mono font-bold tracking-tight text-primary flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              BHAVYA_TRADE
            </h1>
            <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
              <div className={cn("h-1.5 w-1.5 rounded-full", health?.status === "ok" ? "bg-[hsl(152,100%,50%)]" : "bg-destructive animate-pulse")} />
              {health?.status === "ok" ? "SYSTEM ONLINE" : "SYSTEM DEGRADED"}
            </div>
          </div>
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors rounded-sm",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-border/50 text-xs font-mono text-muted-foreground">
            v1.0.4-beta / ENCRYPTED
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
          {/* Subtle grid background */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="flex-1 overflow-y-auto z-10 p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
