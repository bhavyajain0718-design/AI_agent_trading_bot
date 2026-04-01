import { useState } from "react";
import { useListTrades, useSettleTrade } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Link as LinkIcon, Loader2, ArrowUpRight, ArrowDownRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getListTradesQueryKey } from "@workspace/api-client-react";
import { WalletMenu } from "@/components/wallet-menu";
import { useWallet } from "@/hooks/use-wallet";
import { WalletGate } from "@/components/wallet-gate";

const SEPOLIA_ETHERSCAN_BASE = "https://sepolia.etherscan.io";

function isExplorerHash(txHash: string) {
  return txHash.startsWith("0x");
}

export default function Trades() {
  const [symbolFilter, setSymbolFilter] = useState("");
  const { data: trades, isLoading } = useListTrades(
    { symbol: symbolFilter || undefined },
    { query: { refetchInterval: 1000 } },
  );
  const [settleTradeId, setSettleTradeId] = useState<number | null>(null);
  const { connectedWallet } = useWallet();

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
              placeholder="Filter by symbol..." 
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
                <TableHead className="font-mono text-xs text-muted-foreground text-right">ACTION</TableHead>
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
                    NO TRADES FOUND
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
                        {trade.status === "settled" ? (
                          <Badge variant="outline" className="bg-[hsl(270,100%,65%,0.1)] text-[hsl(270,100%,65%)] border-[hsl(270,100%,65%,0.3)] font-mono text-[10px] gap-1 px-2 py-0 rounded-sm">
                            <LinkIcon className="h-3 w-3" />
                            ON-CHAIN
                          </Badge>
                        ) : (
                          <span className={cn(
                            "text-[10px] uppercase px-2 py-1 rounded-sm border",
                            trade.status === "open" ? "text-primary border-primary/20 bg-primary/10" : 
                            trade.status === "closed" ? "text-muted-foreground border-border bg-muted/50" :
                            "text-yellow-500 border-yellow-500/20 bg-yellow-500/10"
                          )}>
                            {trade.status}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(trade.status === "closed" || trade.status === "open") && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-7 text-[10px] font-mono border-[hsl(270,100%,65%,0.3)] text-[hsl(270,100%,65%)] hover:bg-[hsl(270,100%,65%,0.1)] hover:text-[hsl(270,100%,65%)]"
                            onClick={() => setSettleTradeId(trade.id)}
                          >
                            SETTLE
                          </Button>
                        )}
                        {trade.status === "settled" && trade.chainTxHash && (
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

      {settleTradeId && (
        <SettleTradeDialog 
          tradeId={settleTradeId} 
          trade={filteredTrades.find(t => t.id === settleTradeId)}
          connectedWallet={connectedWallet}
          open={!!settleTradeId} 
          onOpenChange={(open) => !open && setSettleTradeId(null)} 
        />
      )}
    </div>
  );
}

function SettleTradeDialog({
  tradeId,
  trade,
  connectedWallet,
  open,
  onOpenChange,
}: {
  tradeId: number,
  trade: any,
  connectedWallet: string | null,
  open: boolean,
  onOpenChange: (open: boolean) => void
}) {
  const settleTrade = useSettleTrade();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const displayedPnl = trade?.pnl ?? "0.00";

  const handleSettle = () => {
    if (!connectedWallet) {
      toast({
        title: "CONNECT WALLET FIRST",
        description: "Settlement uses the connected wallet address and it cannot be edited manually.",
        variant: "destructive",
      });
      return;
    }

    settleTrade.mutate({
      id: tradeId,
      data: {
        walletAddress: connectedWallet,
        pnl: displayedPnl,
      }
    }, {
      onSuccess: () => {
        toast({
          title: "TRADE SETTLED ON-CHAIN",
          description: `Trade #${tradeId} successfully recorded to ledger.`,
        });
        queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({
          title: "SETTLEMENT FAILED",
          description: "Smart contract execution reverted.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-[hsl(270,100%,65%)]" /> 
            ON-CHAIN SETTLEMENT
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Commit trade #{tradeId} final state to smart contract ledger. This action is immutable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="wallet" className="text-right font-mono text-xs text-muted-foreground">
              WALLET
            </Label>
            <div className="col-span-3 flex items-center gap-2">
              <Input
                id="wallet"
                value={connectedWallet ?? "Not connected"}
                readOnly
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pnl" className="text-right font-mono text-xs text-muted-foreground">
              LIVE P&L
            </Label>
            <Input
              id="pnl"
              value={displayedPnl}
              readOnly
              className="col-span-3 font-mono text-xs"
            />
          </div>
          {!connectedWallet ? (
            <p className="text-[10px] font-mono uppercase text-muted-foreground">
              Connect a wallet from the page header before executing settlement.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono text-xs">
            CANCEL
          </Button>
          <Button 
            onClick={handleSettle} 
            disabled={settleTrade.isPending || !connectedWallet}
            className="font-mono text-xs bg-[hsl(270,100%,65%)] text-white hover:bg-[hsl(270,100%,65%,0.8)]"
          >
            {settleTrade.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            EXECUTE TX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
