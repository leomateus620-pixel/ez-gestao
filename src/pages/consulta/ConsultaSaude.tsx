import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useProviderHealth, useDryRun, useDryRunStatus, useFeatureFlag } from "@/features/consulta/hooks/useLookup";
import { ProviderHealthCard } from "@/features/consulta/components/ProviderHealthCard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Play, FileText, Lock } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function ConsultaSaude() {
  const { data: health } = useProviderHealth();
  const { data: dryRun, refetch: refetchDryRun } = useDryRunStatus();
  const { data: flag, refetch: refetchFlag } = useFeatureFlag("consulta_publica_enabled");
  const dryRunMut = useDryRun();
  const qc = useQueryClient();

  const passed = (dryRun?.value_json as any)?.passed === true;

  const toggleFlag = async (enabled: boolean) => {
    if (enabled && !passed) { toast.error("Execute o dry-run com sucesso antes de habilitar."); return; }
    await supabase.from("feature_flags").upsert({
      key: "consulta_publica_enabled",
      enabled,
      description: "Habilita o módulo Consulta CNPJ/CND para todos os usuários",
    });
    refetchFlag();
    qc.invalidateQueries({ queryKey: ["feature-flag"] });
    toast.success(enabled ? "Módulo habilitado no menu" : "Módulo oculto do menu");
  };

  const runDry = async () => {
    toast.message("Dry-run iniciado", { description: "Pode levar até 90s." });
    try {
      const r = await dryRunMut.mutateAsync();
      refetchDryRun();
      toast.success(`Dry-run ${r.passed ? "aprovado" : "reprovado"}`);
    } catch (e: any) {
      toast.error("Falha no dry-run", { description: e?.message });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header><h1 className="text-2xl font-bold tracking-tight">Saúde do módulo</h1></header>

      <ProviderHealthCard health={health} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> Dry-run Zimmermann (88.736.335/0001-13)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Executa CNPJ + CND reais contra o portal Receita pelo Worker Cloudflare. Obrigatório antes de habilitar o módulo no menu.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={runDry} disabled={dryRunMut.isPending}>
              <Play className="h-4 w-4 mr-1" /> {dryRunMut.isPending ? "Executando…" : "Executar dry-run"}
            </Button>
            {dryRun && (
              <span className={`text-sm ${passed ? "text-primary" : "text-destructive"}`}>
                Último: {passed ? "APROVADO" : "REPROVADO"} · {(dryRun.value_json as any)?.last_run_at ? new Date((dryRun.value_json as any).last_run_at).toLocaleString("pt-BR") : "—"}
              </span>
            )}
            {dryRunMut.data?.report_path && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/consulta/relatorios/${encodeURIComponent(dryRunMut.data.report_path)}`}>
                  <FileText className="h-4 w-4 mr-1" /> Ver relatório
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Visibilidade do menu</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch id="flag" checked={!!flag?.enabled} onCheckedChange={toggleFlag} disabled={!passed && !flag?.enabled} />
          <Label htmlFor="flag" className="text-sm">
            {flag?.enabled ? "Módulo visível para todos" : "Módulo oculto do menu (acessível só por URL)"}
          </Label>
          {!passed && <span className="text-xs text-muted-foreground">Habilite após dry-run aprovado.</span>}
        </CardContent>
      </Card>
    </div>
  );
}