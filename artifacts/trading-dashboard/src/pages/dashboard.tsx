import { useGetAgentStatus, useGetChainStatus, useListAgentDecisions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, DollarSign, Target, Briefcase, Link as LinkIcon, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletMenu } from "@/components/wallet-menu";
import { useWallet } from "@/hooks/use-wallet";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const PAPER_TRADING_START_BALANCE = 10000;

function safeNumber(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number" ? value :
      typeof value === "string" ? parseFloat(value) :
        Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function Dashboard() {
  const { connectedWallet } = useWallet();
  const { data: agentStatus, isLoading: loadingAgent } = useGetAgentStatus({ query: { refetchInterval: 5000 } });
  const { data: chainStatus, isLoading: loadingChain } = useGetChainStatus({ query: { refetchInterval: 10000 } });
  const { data: decisions, isLoading: loadingDecisions } = useListAgentDecisions({ limit: 5 }, { query: { refetchInterval: 5000 } });
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["/api/portfolio/summary", connectedWallet],
    enabled: Boolean(connectedWallet),
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch(`/api/portfolio/summary?walletAddress=${connectedWallet}`);
      if (!response.ok) {
        throw new Error("Failed to load wallet portfolio summary");
      }
      return response.json();
    },
  });
  const { data: pnlHistory, isLoading: loadingPnl } = useQuery({
    queryKey: ["/api/portfolio/pnl", connectedWallet],
    enabled: Boolean(connectedWallet),
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch(`/api/portfolio/pnl?walletAddress=${connectedWallet}`);
      if (!response.ok) {
        throw new Error("Failed to load wallet P&L history");
      }
      return response.json();
    },
  });

  const totalValueNum = safeNumber(summary?.totalValue, PAPER_TRADING_START_BALANCE);
  const totalPnlNum = safeNumber(summary?.totalPnl, 0);
  const isProfit = totalPnlNum >= 0;
  const chartData = Array.isArray(pnlHistory) ? pnlHistory : [];
  const recentDecisions = Array.isArray(decisions) ? decisions : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold tracking-tight text-primary uppercase">Command Center</h2>
        <div className="flex items-center gap-4 text-sm font-mono">
          <WalletMenu />
          <StatusBadge label="AGENT" status={agentStatus?.status === "running" ? "ok" : "warn"} />
          <StatusBadge label="WEB3" status={chainStatus?.connected ? "ok" : "error"} />
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Value"
          value={!connectedWallet ? "Connect Wallet" : loadingSummary ? null : `$${totalValueNum.toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
          subtitle={!connectedWallet ? "Wallet-scoped portfolio" : `${summary?.totalTrades || 0} trades for wallet`}
        />
        <StatCard
          title="Net P&L"
          value={!connectedWallet ? "Connect Wallet" : loadingSummary ? null : `${isProfit ? '+' : ''}$${Math.abs(totalPnlNum).toLocaleString()}`}
          icon={<Activity className="h-4 w-4" />}
          valueClassName={!connectedWallet ? "text-muted-foreground" : isProfit ? "text-[hsl(152,100%,50%)]" : "text-destructive"}
          subtitle={!connectedWallet ? "Connect to view wallet P&L" : "Wallet realized P&L"}
        />
        <StatCard
          title="Win Rate"
          value={!connectedWallet ? "Connect Wallet" : loadingSummary ? null : `${(summary?.winRate || 0).toFixed(1)}%`}
          icon={<Target className="h-4 w-4" />}
          subtitle={!connectedWallet ? "Connect to view win rate" : "For connected wallet"}
        />
        <StatCard
          title="On-Chain Settled"
          value={!connectedWallet ? "Connect Wallet" : loadingSummary ? null : `${summary?.onChainSettled || 0} Trades`}
          icon={<LinkIcon className="h-4 w-4 text-[hsl(270,100%,65%)]" />}
          subtitle={!connectedWallet ? "Connect to view settlements" : "Settled by connected wallet"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-7 lg:grid-cols-8">
        {/* Chart */}
        <Card className="md:col-span-4 lg:col-span-5 border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground">Cumulative P&L</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 h-[350px]">
            {!connectedWallet ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center">
                <div className="font-mono text-sm text-muted-foreground uppercase">
                  Connect a wallet to view wallet-specific P&L
                </div>
                <WalletMenu />
              </div>
            ) : loadingPnl ? (
              <div className="w-full h-full flex items-center justify-center">
                <Skeleton className="w-full h-[300px] rounded-lg" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '4px', fontFamily: 'monospace' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorPnl)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground font-mono text-sm">
                NO P&L DATA
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Decisions */}
        <Card className="md:col-span-3 lg:col-span-3 border-border/50 bg-card/50 backdrop-blur flex flex-col">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground">Live Agent Feed</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex-1 overflow-y-auto">
            {loadingDecisions ? (
              <div className="space-y-4 mt-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : recentDecisions.length > 0 ? (
              <div className="space-y-4 mt-4">
                {recentDecisions.map((dec) => (
                  <div key={dec.id} className="flex flex-col gap-1 border-b border-border/20 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono text-sm">
                        <ActionIcon action={dec.action} />
                        <span className="font-bold">{dec.symbol}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(dec.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-muted-foreground">Price: <span className="text-foreground">${dec.price}</span></span>
                      <span className="text-muted-foreground">Conf: <span className="text-primary">{(dec.confidence * 100).toFixed(0)}%</span></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm mt-8">
                NO RECENT DECISIONS
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, subtitle, valueClassName }: { title: string, value: string | null, icon: React.ReactNode, subtitle?: string, valueClassName?: string }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-mono uppercase text-muted-foreground font-medium">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-mono font-bold tracking-tight", valueClassName || "text-foreground")}>
          {value || <Skeleton className="h-8 w-24" />}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ label, status }: { label: string, status: "ok" | "warn" | "error" }) {
  const colors = {
    ok: "text-[hsl(152,100%,50%)] bg-[hsl(152,100%,50%,0.1)] border-[hsl(152,100%,50%,0.2)]",
    warn: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
    error: "text-destructive bg-destructive/10 border-destructive/20"
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] uppercase font-bold", colors[status])}>
      <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse",
        status === "ok" ? "bg-[hsl(152,100%,50%)]" : status === "warn" ? "bg-yellow-500" : "bg-destructive"
      )} />
      {label}
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  if (action === "buy") return <ArrowUpRight className="h-4 w-4 text-[hsl(152,100%,50%)]" />;
  if (action === "sell") return <ArrowDownRight className="h-4 w-4 text-destructive" />;
  if (action === "hold") return <Briefcase className="h-4 w-4 text-primary" />;
  return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
}
