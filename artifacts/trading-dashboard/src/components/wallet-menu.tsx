import { useState } from "react";
import { ChevronDown, LogOut, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWalletAddress, useWallet } from "@/hooks/use-wallet";
import { useToast } from "@/hooks/use-toast";

export function WalletMenu({ className }: { className?: string }) {
  const { connectedWallet, selectedWalletId, walletOptions, connectWallet, disconnectWallet } = useWallet();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedWalletName =
    walletOptions.find((option) => option.id === selectedWalletId)?.name ?? "Wallet";

  const handleConnect = async (walletId: string) => {
    try {
      const account = await connectWallet(walletId);
      setPickerOpen(false);
      toast({
        title: "WALLET CONNECTED",
        description: `Connected ${formatWalletAddress(account)} via ${walletOptions.find((option) => option.id === walletId)?.name ?? "wallet"}.`,
      });
    } catch (error) {
      toast({
        title: "WALLET CONNECTION FAILED",
        description: error instanceof Error ? error.message : "Wallet connection was rejected.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    toast({
      title: "WALLET DISCONNECTED",
      description: "This app is no longer using a connected wallet address.",
    });
  };

  return (
    <>
      {connectedWallet ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={cn("font-mono text-xs border-primary/30 bg-card/50 text-primary", className)}>
              <Wallet className="mr-2 h-4 w-4" />
              {formatWalletAddress(connectedWallet)}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 font-mono">
            <DropdownMenuLabel className="text-xs uppercase text-muted-foreground">Connected Wallet</DropdownMenuLabel>
            <div className="px-2 py-1.5 text-xs">
              <div className="font-semibold text-foreground">{selectedWalletName}</div>
              <div className="mt-1 break-all text-muted-foreground">{connectedWallet}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPickerOpen(true)} className="font-mono text-xs">
              <RefreshCw className="h-4 w-4" />
              Switch Wallet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDisconnect} className="font-mono text-xs text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          variant="outline"
          onClick={() => setPickerOpen(true)}
          className={cn("font-mono text-xs border-primary/30 bg-card/50 text-muted-foreground", className)}
        >
          <Wallet className="mr-2 h-4 w-4" />
          CONNECT WALLET
        </Button>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-[460px] bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary uppercase">Choose Wallet</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Connect or switch the wallet this app should use for settlement identity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {walletOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={!option.installed}
                onClick={() => void handleConnect(option.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm border px-4 py-3 text-left font-mono transition-colors",
                  option.installed
                    ? "border-primary/20 bg-primary/5 hover:bg-primary/10"
                    : "cursor-not-allowed border-border/50 bg-muted/20 opacity-60",
                )}
              >
                <div>
                  <div className="text-sm text-foreground">{option.name}</div>
                  <div className="mt-1 text-[10px] uppercase text-muted-foreground">
                    {option.installed ? "Available in browser" : "Not detected"}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {option.installed ? "Connect" : "Unavailable"}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
