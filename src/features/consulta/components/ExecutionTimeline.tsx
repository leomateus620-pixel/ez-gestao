import { buildTimeline } from "../services/timeline";
import { CheckCircle2, Loader2, AlertTriangle, Rocket } from "lucide-react";

interface Props { logs?: any[]; isFinal?: boolean; cacheHit?: boolean }

export function ExecutionTimeline({ logs, isFinal, cacheHit }: Props) {
  const steps = buildTimeline(logs);
  return (
    <div className="space-y-3">
      {cacheHit && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          <Rocket className="h-4 w-4 text-primary" />
          <div>
            <div className="font-medium text-primary">Resultado servido do cache (24h)</div>
            <div className="text-xs text-muted-foreground">
              Sem chamada ao portal — resposta replicada de uma consulta recente para reduzir rate limit.
            </div>
          </div>
        </div>
      )}
      {steps.length === 0 && (
        <div className="text-sm text-muted-foreground italic">
          {cacheHit ? "Sem etapas — resultado veio do cache." : "Aguardando primeiros logs…"}
        </div>
      )}
      {steps.map((s, idx) => {
        const Icon = s.level === "error" ? AlertTriangle : (idx === steps.length - 1 && !isFinal ? Loader2 : CheckCircle2);
        const tone = s.level === "error" ? "text-destructive" : s.level === "warning" ? "text-yellow-500" : "text-primary";
        return (
          <div key={idx} className="flex items-start gap-3">
            <Icon className={`h-4 w-4 mt-0.5 ${tone} ${idx === steps.length - 1 && !isFinal ? "animate-spin" : ""}`} />
            <div className="flex-1">
              <div className="text-sm font-medium">{s.label}</div>
              {s.message && <div className="text-xs text-muted-foreground">{s.message}</div>}
              <div className="text-[10px] text-muted-foreground/70">{new Date(s.at).toLocaleTimeString("pt-BR")}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}