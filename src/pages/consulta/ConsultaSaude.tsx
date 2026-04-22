import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useProviderHealth, useDryRun, useDryRunStatus, useFeatureFlag, useHmacDiagnose } from "@/features/consulta/hooks/useLookup";
import { ProviderHealthCard } from "@/features/consulta/components/ProviderHealthCard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Play, FileText, Lock, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function ConsultaSaude() {
  const { data: health } = useProviderHealth();
  const { data: dryRun, refetch: refetchDryRun } = useDryRunStatus();
  const { data: flag, refetch: refetchFlag } = useFeatureFlag("consulta_publica_enabled");
  const dryRunMut = useDryRun();
  const diagMut = useHmacDiagnose();
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
    if (!diagMut.data?.ok) {
      toast.message("Verificando HMAC antes do dry-run…");
      try {
        const d = await diagMut.mutateAsync();
        if (!d.ok) {
          toast.error("HMAC inválido", { description: d.message });
          return;
        }
      } catch (e: any) {
        toast.error("Falha no diagnóstico HMAC", { description: e?.message });
        return;
      }
    }
    toast.message("Dry-run iniciado", { description: "Pode levar até 90s." });
    try {
      const r = await dryRunMut.mutateAsync();
      refetchDryRun();
      toast.success(`Dry-run ${r.passed ? "aprovado" : "reprovado"}`);
    } catch (e: any) {
      toast.error("Falha no dry-run", { description: e?.message });
    }
  };

  const runDiag = async () => {
    try {
      const d = await diagMut.mutateAsync();
      toast[d.ok ? "success" : "error"](d.message);
    } catch (e: any) {
      toast.error("Falha no diagnóstico", { description: e?.message });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header><h1 className="text-2xl font-bold tracking-tight">Saúde do módulo</h1></header>

      <ProviderHealthCard health={health} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {diagMut.data?.ok ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4" />}
            Diagnóstico HMAC (Lovable ↔ Worker)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Compara o segredo HMAC do Lovable Cloud com o do Worker. Obrigatório bater antes do dry-run.
          </p>
          <Button onClick={runDiag} disabled={diagMut.isPending} variant="outline">
            <ShieldCheck className="h-4 w-4 mr-1" /> {diagMut.isPending ? "Verificando…" : "Diagnosticar HMAC"}
          </Button>
          {diagMut.data && (
            <div className={`text-sm rounded-md border p-3 ${diagMut.data.ok ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
              <p className="font-medium">{diagMut.data.message}</p>
              {diagMut.data.local && diagMut.data.worker && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <div className="text-muted-foreground">Lovable</div>
                    <div>fp: {diagMut.data.local.fingerprint}</div>
                    <div>len: {diagMut.data.local.secret_length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Worker</div>
                    <div>fp: {diagMut.data.worker.fingerprint || "—"}</div>
                    <div>len: {diagMut.data.worker.secret_length || 0}</div>
                  </div>
                </div>
              )}
              {!diagMut.data.ok && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Como corrigir</summary>
                  <pre className="mt-2 whitespace-pre-wrap">
{`# 1) No Lovable Cloud (Settings → Secrets), copie o valor de
#    CLOUDFLARE_WORKER_HMAC_SECRET

# 2) No terminal do projeto cloudflare-worker:
cd cloudflare-worker
wrangler secret put LOVABLE_HMAC_SECRET
# (cole o MESMO valor do passo 1)

# 3) Verifique novamente clicando em "Diagnosticar HMAC".`}
                  </pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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