import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExceptionsCenter } from "@/features/consulta/hooks/useLookup";
import { describeError } from "@/features/consulta/services/classification";
import { Badge } from "@/components/ui/badge";

export default function ConsultaExcecoes() {
  const { data, isLoading } = useExceptionsCenter();
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header><h1 className="text-2xl font-bold tracking-tight">Exceções</h1></header>
      <Card>
        <CardHeader><CardTitle className="text-base">Central de exceções</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && (data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground italic">Nenhuma exceção registrada.</p>}
          {(data || []).map((ex) => {
            const meta = describeError(ex.exception_type);
            return (
              <div key={ex.id} className="rounded-md border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={ex.severity === "error" || ex.severity === "critical" ? "destructive" : ex.severity === "warning" ? "outline" : "secondary"}>
                    {ex.severity}
                  </Badge>
                  <Badge variant="outline">{ex.status}</Badge>
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="ml-auto text-xs text-muted-foreground">{new Date(ex.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="text-xs text-muted-foreground">{ex.description}</div>
                <div className="text-xs">Sugestão: {meta.suggestion}</div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}