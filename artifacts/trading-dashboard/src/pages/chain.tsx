import { useGetChainStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LinkIcon, Activity, BoxSelect, Database, Cpu, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/hooks/use-wallet";
import { WalletGate } from "@/components/wallet-gate";
import { useQuery } from "@tanstack/react-query";

const SEPOLIA_ETHERSCAN_BASE = "https://sepolia.etherscan.io";

function isExplorerHash(txHash: string) {
  return txHash.startsWith("0x");
}

export default function Chain() {
  const { connectedWallet } = useWallet();
  const { data: chainStatus, isLoading: loadingStatus } = useGetChainStatus({ query: { refetchInterval: 15000 } });
  const { data: pnlStats, isLoading: loadingPnl } = useQuery({
    queryKey: ["/api/chain/on-chain-pnl", connectedWallet],
    enabled: Boolean(connectedWallet),
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch(`/api/chain/on-chain-pnl?walletAddress=${connectedWallet}`);
      if (!response.ok) {
        throw new Error("Failed to load wallet on-chain P&L");
      }
      return response.json();
    },
  });
  const { data: onChainTrades, isLoading: loadingTrades } = useQuery({
    queryKey: ["/api/chain/on-chain-trades", connectedWallet],
    enabled: Boolean(connectedWallet),
    refetchInterval: 5000,
    queryFn: async () => {
      const response = await fetch(`/api/chain/on-chain-trades?limit=10&walletAddress=${connectedWallet}`);
      if (!response.ok) {
        throw new Error("Failed to load wallet on-chain trades");
      }
      return response.json();
    },
  });
  const recentOnChainTrades = Array.isArray(onChainTrades) ? onChainTrades : [];

  if (!connectedWallet) {
    return (
      <WalletGate
        title="Web3 Settlement Locked"
        description="Connect a wallet first to inspect on-chain settlements. This page is reserved for wallet-scoped ledger activity and transaction history."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold tracking-tight text-[hsl(270,100%,65%)] uppercase flex items-center gap-3">
          <BoxSelect className="h-6 w-6" />
          Web3 Subsystem
        </h2>
        {chainStatus && (
          <Badge variant="outline" className={cn(
            "font-mono text-xs gap-1.5 px-3 py-1 rounded-sm",
            chainStatus.connected 
              ? "bg-[hsl(152,100%,50%,0.1)] text-[hsl(152,100%,50%)] border-[hsl(152,100%,50%,0.3)]" 
              : "bg-destructive/10 text-destructive border-destructive/30"
          )}>
            <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", chainStatus.connected ? "bg-[hsl(152,100%,50%)]" : "bg-destructive")} />
            {chainStatus.network} NETWORK
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-[hsl(270,100%,65%,0.3)] bg-card/50 backdrop-blur shadow-[0_0_15px_rgba(176,0,255,0.05)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase text-[hsl(270,100%,65%)] flex items-center gap-2">
              <Database className="h-4 w-4" />
              Contract Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStatus ? <Skeleton className="h-6 w-full" /> : (
              <div className="font-mono text-sm break-all bg-background/50 p-2 rounded border border-border/50 text-muted-foreground select-all">
                {chainStatus?.contractAddress || "NOT DEPLOYED"}
              </div>
            )}
            <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase">
              TradingLedger.sol
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase text-muted-foreground">
              On-Chain Realized P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPnl ? <Skeleton className="h-8 w-32" /> : (
              <div className={cn(
                "text-2xl font-mono font-bold",
                parseFloat(pnlStats?.totalPnl || "0") >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive"
              )}>
                {parseFloat(pnlStats?.totalPnl || "0") >= 0 ? "+" : ""}${Math.abs(parseFloat(pnlStats?.totalPnl || "0")).toFixed(2)}
              </div>
            )}
            <p className="text-[10px] font-mono text-muted-foreground mt-1 uppercase">
              Finalized across {pnlStats?.totalTrades || 0} on-chain settlements
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase text-muted-foreground">
              RPC Endpoint
            </CardTitle>
          </CardHeader>
          <CardContent>
             {loadingStatus ? <Skeleton className="h-6 w-full" /> : (
              <div className="font-mono text-sm truncate text-foreground">
                {chainStatus?.rpcUrl}
              </div>
            )}
            <p className="text-[10px] font-mono text-muted-foreground mt-2 uppercase flex items-center gap-1">
              <Activity className="h-3 w-3 text-primary" />
              Latency: 42ms
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-[hsl(270,100%,65%)]" />
              Settlement Ledger (Latest 10)
            </CardTitle>
            <CardDescription className="font-mono text-[10px] uppercase text-muted-foreground">
              Shows finalized on-chain close and settlement transactions for this wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] text-muted-foreground">TX HASH</TableHead>
                  <TableHead className="font-mono text-[10px] text-muted-foreground">TRADE</TableHead>
                  <TableHead className="font-mono text-[10px] text-muted-foreground text-right">PNL</TableHead>
                  <TableHead className="font-mono text-[10px] text-muted-foreground text-right">TIMESTAMP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTrades ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : recentOnChainTrades.length > 0 ? (
                  recentOnChainTrades.map((tx) => (
                    <TableRow key={`${tx.txHash}-${tx.tradeId}-${tx.timestamp}`} className="border-border/20 group">
                      <TableCell className="font-mono text-[10px]">
                        {isExplorerHash(tx.txHash) ? (
                          <a href={`${SEPOLIA_ETHERSCAN_BASE}/tx/${tx.txHash}`} target="_blank" rel="noreferrer" className="text-[hsl(270,100%,65%)] hover:underline decoration-[hsl(270,100%,65%,0.5)] underline-offset-4">
                            {tx.txHash.substring(0,8)}...{tx.txHash.substring(tx.txHash.length-6)}
                          </a>
                        ) : (
                          <span className="text-[hsl(270,100%,65%)]">
                            {tx.txHash}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{tx.symbol}</span>
                          <span className={cn("text-[10px]", tx.side === 'buy' ? "text-[hsl(152,100%,50%)]" : "text-destructive")}>{tx.side.toUpperCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn(
                        "font-mono text-xs text-right",
                        parseFloat(tx.pnl) >= 0 ? "text-[hsl(152,100%,50%)]" : "text-destructive"
                      )}>
                        {parseFloat(tx.pnl) >= 0 ? '+' : ''}${Math.abs(parseFloat(tx.pnl)).toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground text-right">
                        {new Date(tx.timestamp).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 font-mono text-xs text-muted-foreground">
                      NO ON-CHAIN TXS
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Contract ABI Ref
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4 font-mono text-xs">
              <div className="space-y-1">
                <div className="text-[hsl(270,100%,65%)] font-bold">function recordTrade()</div>
                <div className="text-muted-foreground pl-4 border-l border-border/50">
                  <span className="text-primary">uint256</span> tradeId,<br/>
                  <span className="text-primary">int256</span> pnl,<br/>
                  <span className="text-primary">address</span> user
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 bg-muted/30 p-2 rounded-sm border border-border/50">
                  Emits TradeRecorded event. Requires owner role.
                </div>
              </div>
              
              <div className="space-y-1 mt-6">
                <div className="text-[hsl(270,100%,65%)] font-bold">function getPnl()</div>
                <div className="text-muted-foreground pl-4 border-l border-border/50">
                  <span className="text-primary">address</span> user
                </div>
                <div className="text-[10px] text-primary/70 mt-1">
                  Returns (int256 totalPnl)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
