import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface Props { health?: any }

export function ProviderHealthCard({ health }: Props) {
  if (!health) return null;
  const ok = health.worker_health?.ok;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Saúde do Provedor
          <Badge variant={ok ? "default" : "destructive"} className="ml-auto gap-1">
            {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {ok ? "Online" : "Offline"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!health.worker_configured && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            Worker Cloudflare não configurado (faltam secrets).
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Na fila" value={health.queue?.queued ?? 0} />
          <Stat label="Executando" value={health.queue?.running ?? 0} />
          <Stat label="Sucesso 24h" value={health.last_24h?.success ?? 0} />
          <Stat label="Falhas 24h" value={health.last_24h?.failed ?? 0} />
        </div>
        <div className="space-y-2">
          {(health.providers || []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
              <div className="font-mono">{p.provider_name}</div>
              <div className="flex items-center gap-3">
                <span>Sucesso: {Math.round(p.success_rate_24h || 0)}%</span>
                <span>Latência: {Math.round(p.avg_latency_ms_24h || 0)}ms</span>
                <Badge variant={p.status === "online" ? "default" : "outline"}>{p.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}