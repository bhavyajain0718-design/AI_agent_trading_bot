import { useEffect, useState } from "react";
import { useGetAgentStatus, useListAgentDecisions, getGetAgentStatusQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Square, Pause, Cpu, Activity, Brain, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/hooks/use-wallet";
import { WalletGate } from "@/components/wallet-gate";

async function patchAgentStatus(status: "running" | "paused" | "stopped") {
  const timeframe = window.localStorage.getItem("agent-timeframe") ?? "1h";
  const res = await fetch("/api/agent/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, timeframe }),
  });
  if (!res.ok) throw new Error("Failed to update agent status");
  return res.json();
}

async function fetchAgentConfig() {
  const res = await fetch("/api/agent/config", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error("Failed to fetch agent config");
  }
  return res.json() as Promise<{
    timeframe: string;
    availableTimeframes: Array<{ key: string; label: string }>;
  }>;
}

async function patchAgentTimeframe(timeframe: string, status: "running" | "paused" | "stopped") {
  const res = await fetch("/api/agent/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, timeframe }),
  });
  if (!res.ok) {
    throw new Error("Failed to update agent timeframe");
  }
  return res.json();
}

export default function Agent() {
  const { connectedWallet } = useWallet();
  const queryClient = useQueryClient();
  const { data: status, isLoading: loadingStatus } = useGetAgentStatus({ query: { refetchInterval: 3000 } });
  const { data: decisions, isLoading: loadingDecisions } = useListAgentDecisions({ limit: 20 }, { query: { refetchInterval: 5000 } });
  const { toast } = useToast();
  const recentDecisions = Array.isArray(decisions) ? decisions : [];
  const [displayUptime, setDisplayUptime] = useState(0);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [availableTimeframes, setAvailableTimeframes] = useState<Array<{ key: string; label: string }>>([]);

  if (!connectedWallet) {
    return (
      <WalletGate
        title="Agent Control Locked"
        description="Connect a wallet first to access autonomous trading controls. Agent execution and settlements should be tied to an active wallet session."
      />
    );
  }

  const { mutate: changeState, isPending } = useMutation({
    mutationFn: patchAgentStatus,
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: getGetAgentStatusQueryKey() });
      toast({
        title: `AGENT ${newStatus.toUpperCase()}`,
        description: `Signal sent to core engine.`,
      });
    },
    onError: () => {
      toast({
        title: "COMMAND FAILED",
        description: "Could not reach the agent core.",
        variant: "destructive",
      });
    },
  });

  const currentState = status?.status ?? "stopped";

  useEffect(() => {
    setDisplayUptime(status?.uptime ?? 0);
  }, [status?.uptime, currentState]);

  useEffect(() => {
    void fetchAgentConfig()
      .then((config) => {
        setSelectedTimeframe(config.timeframe);
        setAvailableTimeframes(config.availableTimeframes);
        window.localStorage.setItem("agent-timeframe", config.timeframe);
      })
      .catch(() => {
        const stored = window.localStorage.getItem("agent-timeframe") ?? "1h";
        setSelectedTimeframe(stored);
      });
  }, []);

  useEffect(() => {
    if (currentState !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      setDisplayUptime((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentState]);

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    window.localStorage.setItem("agent-timeframe", timeframe);

    void patchAgentTimeframe(timeframe, currentState)
      .then(() => {
        toast({
          title: `TIMEFRAME ${timeframe.toUpperCase()}`,
          description: "Agent execution window updated.",
        });
      })
      .catch(() => {
        toast({
          title: "TIMEFRAME UPDATE FAILED",
          description: "Could not apply the selected execution timeframe.",
          variant: "destructive",
        });
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-mono font-bold tracking-tight text-primary uppercase flex items-center gap-3">
          <Brain className="h-6 w-6" />
          Autonomous Core
        </h2>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "font-mono text-xs",
              currentState === "running"
                ? "bg-[hsl(152,100%,50%,0.2)] text-[hsl(152,100%,50%)] border-[hsl(152,100%,50%,0.5)]"
                : "border-border hover:text-primary"
            )}
            onClick={() => changeState("running")}
            disabled={currentState === "running" || isPending}
          >
            <Play className="h-3 w-3 mr-2" />
            START
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "font-mono text-xs",
              currentState === "paused"
                ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
                : "border-border hover:text-yellow-500"
            )}
            onClick={() => changeState("paused")}
            disabled={currentState === "paused" || isPending}
          >
            <Pause className="h-3 w-3 mr-2" />
            PAUSE
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "font-mono text-xs",
              currentState === "stopped"
                ? "bg-destructive/20 text-destructive border-destructive/50"
                : "border-border hover:text-destructive"
            )}
            onClick={() => changeState("stopped")}
            disabled={currentState === "stopped" || isPending}
          >
            <Square className="h-3 w-3 mr-2" />
            HALT
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Core Config */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="pb-4 border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Engine Config
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">State</div>
              <div className={cn(
                "font-mono text-sm p-2 rounded border uppercase",
                currentState === "running" ? "bg-[hsl(152,100%,50%,0.1)] text-[hsl(152,100%,50%)] border-[hsl(152,100%,50%,0.3)]" :
                currentState === "paused" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" :
                "bg-destructive/10 text-destructive border-destructive/30"
              )}>
                {loadingStatus ? <Skeleton className="h-5 w-20" /> : currentState}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Active Strategy</div>
              <div className="font-mono text-sm text-primary bg-primary/5 p-2 rounded border border-primary/20">
                {loadingStatus ? <Skeleton className="h-5 w-32" /> : status?.strategy}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-2">Execution Timeframe</div>
              <div className="flex flex-wrap gap-2">
                {(availableTimeframes.length > 0
                  ? availableTimeframes
                  : [
                      { key: "5m", label: "5M" },
                      { key: "10m", label: "10M" },
                      { key: "30m", label: "30M" },
                      { key: "1h", label: "1H" },
                      { key: "1d", label: "1D" },
                    ]).map((timeframe) => (
                  <Button
                    key={timeframe.key}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "font-mono text-xs",
                      selectedTimeframe === timeframe.key
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => handleTimeframeChange(timeframe.key)}
                  >
                    {timeframe.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Exchange Link</div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <div className={cn("h-2 w-2 rounded-full", status?.krakenConnected ? "bg-[hsl(152,100%,50%)]" : "bg-destructive")} />
                  {status?.krakenConnected ? "KRAKEN_OK" : "ERR_CONN"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Web3 Layer</div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <div className={cn("h-2 w-2 rounded-full", status?.web3Connected ? "bg-[hsl(152,100%,50%)]" : "bg-destructive")} />
                  {status?.web3Connected ? "ETH_OK" : "ERR_RPC"}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Uptime</div>
              <div className="font-mono text-2xl font-light tracking-tight">
                {loadingStatus ? <Skeleton className="h-8 w-24" /> : formatUptime(displayUptime)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Intelligence Feed */}
        <Card className="md:col-span-2 border-border/50 bg-card/50 backdrop-blur flex flex-col h-[500px]">
          <CardHeader className="pb-4 border-b border-border/50 flex-none">
            <CardTitle className="text-sm font-mono uppercase text-muted-foreground flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Reasoning Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-y-auto">
            <div className="divide-y divide-border/30">
              {loadingDecisions ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : recentDecisions.length === 0 ? (
                <div className="p-10 text-center font-mono text-muted-foreground text-sm">
                  WAITING FOR SIGNALS...
                </div>
              ) : (
                recentDecisions.map(dec => (
                  <div key={dec.id} className="p-4 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={cn(
                          "font-mono text-[10px] uppercase rounded-sm border",
                          dec.action === 'buy' ? "bg-[hsl(152,100%,50%,0.1)] text-[hsl(152,100%,50%)] border-[hsl(152,100%,50%,0.3)]" :
                          dec.action === 'sell' ? "bg-destructive/10 text-destructive border-destructive/30" :
                          "bg-primary/10 text-primary border-primary/30"
                        )}>
                          {dec.action}
                        </Badge>
                        <span className="font-mono font-bold text-sm">{dec.symbol}</span>
                        <span className="font-mono text-xs text-muted-foreground">@ ${dec.price}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-[10px] text-primary">
                          CONF: {(dec.confidence * 100).toFixed(1)}%
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(dec.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                      <span className="text-foreground/50 mr-2">{'>'}</span>
                      {dec.reasoning}
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-primary/60 truncate">
                      [ind: {dec.indicators}]
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
