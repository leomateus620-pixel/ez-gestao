import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock3, XCircle, AlertTriangle, Hourglass } from "lucide-react";

interface Props { status?: string | null }

const MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; Icon: any }> = {
  queued: { label: "Na fila", variant: "outline", Icon: Hourglass },
  running: { label: "Executando", variant: "secondary", Icon: Clock3 },
  dispatched: { label: "Despachado", variant: "secondary", Icon: Clock3 },
  success: { label: "Sucesso", variant: "default", Icon: CheckCircle2 },
  failed: { label: "Falhou", variant: "destructive", Icon: XCircle },
  manual_required: { label: "Ação manual", variant: "outline", Icon: AlertTriangle },
  partial: { label: "Parcial", variant: "outline", Icon: AlertTriangle },
  cancelled: { label: "Cancelado", variant: "outline", Icon: XCircle },
};

export function StatusBadge({ status }: Props) {
  const m = MAP[status || ""] || { label: status || "—", variant: "outline" as const, Icon: Clock3 };
  return (
    <Badge variant={m.variant} className="gap-1">
      <m.Icon className="h-3 w-3" /> {m.label}
    </Badge>
  );
}