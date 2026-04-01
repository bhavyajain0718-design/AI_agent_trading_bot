import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletMenu } from "@/components/wallet-menu";

export function WalletGate({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-xl border-border/50 bg-card/60 backdrop-blur">
        <CardHeader className="border-b border-border/50">
          <CardTitle className="flex items-center gap-3 font-mono text-xl uppercase text-primary">
            <ShieldAlert className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <p className="font-mono text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          <div className="flex justify-start">
            <WalletMenu />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
