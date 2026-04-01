import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link as LinkIcon, Loader2, ArrowUpRight, ArrowDownRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { WalletMenu } from "@/components/wallet-menu";
import { useWallet } from "@/hooks/use-wallet";
import { WalletGate } from "@/components/wallet-gate";

const SEPOLIA_ETHERSCAN_BASE = "https://sepolia.etherscan.io";

function isExplorerHash(txHash: string) {
  return txHash.startsWith("0x");
}

export default function Trades() {
  const [symbolFilter, setSymbolFilter] = useState("");
  const { connectedWallet } = useWallet();

  const { data: trades, isLoading } = useQuery({
    queryKey: ["/api/trades", connectedWallet, symbolFilter, "open"],
    enabled: Boolean(connectedWallet),
    refetchInterval: 1000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (connectedWallet) {
        params.set("walletAddress", connectedWallet);
      }
      if (symbolFilter) {
        params.set("symbol", symbolFilter);
      }
      params.set("status", "open");

      const response = await fetch(`/api/trades?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load wallet trades");
      }
      return response.json();
    },
  });

  const filteredTrades = Array.isArray(trades) ? trades : [];

  if (!connectedWallet) {
    return (
      <WalletGate
        title="Trades Locked"
        description="Connect a wallet first to open the trade ledger. Wallet connection determines which settlements and portfolio data belong to this session."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold tracking-tight text-primary uppercase">Trade Ledger</h2>
        <div className="flex items-center gap-3">
          <WalletMenu />
          <div className="flex items-center gap-2 max-w-xs w-full relative">
            <Search className="h-4 w-4 text-muted-foreground absolute ml-3" />
            <Input 
              placeholder="Filter active trades..." 
              className="pl-9 font-mono text-sm bg-card/50"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="font-mono text-xs text-muted-foreground w-[100px]">ID</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground w-[150px]">SYMBOL</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground">SIDE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-right">PRICE</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-right">QUANTITY</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-right">P&L</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-center">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground text-right">ON-CHAIN OPEN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 font-mono text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    LOADING LEDGER...
                  </TableCell>
                </TableRow>
              ) : filteredTrades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 font-mono text-muted-foreground">
                    NO ACTIVE TRADES
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrades.map((trade) => {
                  const pnlVal = trade.pnl ? parseFloat(trade.pnl) : 0;
                  const hasPnl = trade.pnl !== null && trade.pnl !== undefined;
                  const isProfit = pnlVal >= 0;

                  return (
                    <TableRow key={trade.id} className="border-border/20 font-mono text-sm group">
                      <TableCell className="text-muted-foreground">#{trade.id.toString().padStart(4, '0')}</TableCell>
                      <TableCell className="font-bold">{trade.symbol}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "flex items-center gap-1 text-xs uppercase",
                          trade.side === "buy" ? "text-[hsl(152,100%,50%)]" : "text-destructive"
                        )}>
                          {trade.side === "buy" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {trade.side}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">${parseFloat(trade.price).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{trade.quantity}</TableCell>
                      <TableCell className={cn(
                        "text-right",
                        !hasPnl ? "text-muted-foreground" : isProfit ? "text-[hsl(152,100%,50%)]" : "text-destructive"
                      )}>
                        {hasPnl ? `${isProfit ? '+' : ''}$${Math.abs(pnlVal).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-[10px] uppercase px-2 py-1 rounded-sm border text-primary border-primary/20 bg-primary/10">
                          active
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {trade.chainTxHash ? (
                          isExplorerHash(trade.chainTxHash) ? (
                            <a
                              href={`${SEPOLIA_ETHERSCAN_BASE}/tx/${trade.chainTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-muted-foreground hover:text-primary transition-colors underline decoration-border underline-offset-4"
                            >
                              {trade.chainTxHash.substring(0,6)}...{trade.chainTxHash.substring(trade.chainTxHash.length-4)}
                            </a>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {trade.chainTxHash}
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            pending...
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
