import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useProviderHealth, useDryRun, useDryRunStatus, useFeatureFlag, useHmacDiagnose, useDryRunLive, useCancelDryRun } from "@/features/consulta/hooks/useLookup";
import { ProviderHealthCard } from "@/features/consulta/components/ProviderHealthCard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Play, FileText, Lock, ShieldCheck, ShieldAlert, Server, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { describeError } from "@/features/consulta/services/classification";

export default function ConsultaSaude() {
  const { data: health } = useProviderHealth();
  const { data: dryRun, refetch: refetchDryRun } = useDryRunStatus();
  const { data: flag, refetch: refetchFlag } = useFeatureFlag("consulta_publica_enabled");
  const dryRunMut = useDryRun();
  const cancelMut = useCancelDryRun();
  const diagMut = useHmacDiagnose();
  const qc = useQueryClient();
  const [polling, setPolling] = useState(false);
  const { data: live } = useDryRunLive(polling);

  const dryV: any = (dryRun?.value_json as any) || {};
  const passed = (live?.passed ?? dryV.passed) === true;
  const inProgress = !!(live?.in_progress ?? dryV.in_progress);
  const cnpjStatus = live?.cnpj_status ?? dryV.cnpj_status;
  const cndStatus = live?.cnd_status ?? dryV.cnd_status;
  const cndtStatus = live?.cndt_status ?? dryV.cndt_status;
  const cnpjErr = live?.cnpj_error_type ?? dryV.cnpj_error_type;
  const cnpjErrMsg = live?.cnpj_error_message ?? dryV.cnpj_error_message;
  const cndErr = live?.cnd_error_type ?? dryV.cnd_error_type;
  const cndErrMsg = live?.cnd_error_message ?? dryV.cnd_error_message;
  const cndtErr = live?.cndt_error_type ?? dryV.cndt_error_type;
  const cndtErrMsg = live?.cndt_error_message ?? dryV.cndt_error_message;
  const signedUrl = live?.signed_url || null;
  const lastRunAt = live?.last_run_at ?? dryV.last_run_at;
  const cnpjReqId = live?.cnpj_request_id ?? dryV.cnpj_request_id;
  const cndReqId = live?.cnd_request_id ?? dryV.cnd_request_id;
  const cndtReqId = live?.cndt_request_id ?? dryV.cndt_request_id;
  const phase = live?.phase ?? dryV.phase;
  const workerHealth: any = (health as any)?.worker_health?.body ?? null;
  const workerHealthOk = !!(health as any)?.worker_health?.ok;

  useEffect(() => {
    const terminalPhases = ["done", "cancelled"];
    if ((dryV.in_progress === true || (!!phase && !terminalPhases.includes(phase))) && !polling) {
      setPolling(true);
    }
    if (live && !live.in_progress && polling) {
      setPolling(false);
      refetchDryRun();
    }
  }, [dryV.in_progress, phase, live, polling, refetchDryRun]);

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
    toast.message("Dry-run iniciado", { description: "Acompanhando progresso ao vivo…" });
    try {
      await dryRunMut.mutateAsync();
      setPolling(true);
      qc.invalidateQueries({ queryKey: ["dry-run-live"] });
      refetchDryRun();
    } catch (e: any) {
      toast.error("Falha no dry-run", { description: e?.message });
    }
  };

  const cancelDry = async () => {
    try {
      const r = await cancelMut.mutateAsync();
      toast.success("Dry-run cancelado", { description: `${r.cancelled_jobs} job(s) marcado(s) como cancelados.` });
      setPolling(false);
      refetchDryRun();
    } catch (e: any) {
      toast.error("Falha ao cancelar", { description: e?.message });
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
            <Server className="h-4 w-4" /> Status do Worker Cloudflare
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!workerHealth ? (
            <p className="text-sm text-muted-foreground">Worker inacessível ou ainda não respondeu.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Online</div>
                <div className={workerHealthOk ? "text-primary font-medium" : "text-destructive font-medium"}>
                  {workerHealthOk ? "Sim" : "Não"}
                </div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Build</div>
                <div className="font-mono text-xs">{workerHealth.build_id || workerHealth.version || "—"}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">Browser binding</div>
                <div className="font-mono text-xs">{workerHealth.browser_binding || "—"}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">LOVABLE_HMAC_SECRET</div>
                <div className={workerHealth.has_lovable_secret ? "text-primary" : "text-destructive"}>
                  {workerHealth.has_lovable_secret ? "Configurado" : "Faltando"}
                </div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-xs text-muted-foreground">CALLBACK_HMAC_SECRET</div>
                <div className={workerHealth.has_callback_secret ? "text-primary" : "text-destructive"}>
                  {workerHealth.has_callback_secret ? "Configurado" : "Faltando"}
                </div>
              </div>
              <div className="rounded-md border p-2 col-span-2 md:col-span-3">
                <div className="text-xs text-muted-foreground">CALLBACK_BASE_URL</div>
                <div className={`font-mono text-xs break-all ${workerHealth.callback_base_valid === false ? "text-destructive" : ""}`}>
                  {workerHealth.callback_base ? JSON.stringify(workerHealth.callback_base) : "—"}
                </div>
                {workerHealth.callback_base_valid === false && (
                  <div className="text-xs text-destructive mt-1">
                    Inválido ({workerHealth.callback_base_issue}). Rode: <code>wrangler secret put CALLBACK_BASE_URL</code>
                  </div>
                )}
              </div>
              <div className="rounded-md border p-2 col-span-2 md:col-span-3">
                <div className="text-xs text-muted-foreground">Endpoint /debug-sign</div>
                <div className={workerHealth.has_debug_sign ? "text-primary" : "text-destructive"}>
                  {workerHealth.has_debug_sign
                    ? "Disponível (deploy atualizado)"
                    : "Ausente — rode: wrangler deploy"}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> Dry-run Weinert (47.737.345/0001-96)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Executa CNPJ → CND → CNDT (TST) em sequência controlada via Worker Cloudflare. Obrigatório antes de habilitar o módulo no menu.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={runDry} disabled={dryRunMut.isPending || inProgress}>
              <Play className="h-4 w-4 mr-1" /> {inProgress ? "Executando…" : dryRunMut.isPending ? "Disparando…" : "Executar dry-run"}
            </Button>
            {inProgress && (
              <Button onClick={cancelDry} disabled={cancelMut.isPending} variant="destructive">
                <X className="h-4 w-4 mr-1" /> {cancelMut.isPending ? "Cancelando…" : "Cancelar dry-run"}
              </Button>
            )}
            {(dryRun || live) && (
              <span className={`text-sm ${inProgress ? "text-muted-foreground" : passed ? "text-primary" : "text-destructive"}`}>
                {inProgress ? "EM ANDAMENTO" : `Último: ${passed ? "APROVADO" : "REPROVADO"}`}
                {lastRunAt && ` · ${new Date(lastRunAt).toLocaleString("pt-BR")}`}
              </span>
            )}
            {signedUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={signedUrl} target="_blank" rel="noreferrer">
                  <FileText className="h-4 w-4 mr-1" /> Ver relatório JSON
                </a>
              </Button>
            )}
          </div>

          {(cnpjStatus || cndStatus || cndtStatus) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <DryRunSubCard
                label="CNPJ (Receita Federal)"
                status={cnpjStatus}
                errorType={cnpjErr}
                errorMessage={cnpjErrMsg}
                requestId={cnpjReqId}
              />
              <DryRunSubCard
                label="CND (Receita Federal)"
                status={cndStatus}
                errorType={cndErr}
                errorMessage={cndErrMsg}
                requestId={cndReqId}
              />
              <DryRunSubCard
                label="CNDT (Justiça do Trabalho)"
                status={cndtStatus}
                errorType={cndtErr}
                errorMessage={cndtErrMsg}
                requestId={cndtReqId}
              />
            </div>
          )}
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

function DryRunSubCard({ label, status, errorType, errorMessage, requestId }: {
  label: string; status?: string; errorType?: string | null; errorMessage?: string | null; requestId?: string;
}) {
  const isFailed = status === "failed";
  const isManual = status === "manual_required";
  const isOk = status === "success";
  const desc = errorType ? describeError(errorType) : null;
  return (
    <div className={`rounded-md border p-3 text-sm ${isOk ? "border-primary/30 bg-primary/5" : isFailed ? "border-destructive/30 bg-destructive/5" : isManual ? "border-yellow-500/30 bg-yellow-500/5" : "border-border"}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
          <span className={`text-xs uppercase tracking-wide ${isOk ? "text-primary" : isFailed || status === "cancelled" ? "text-destructive" : isManual ? "text-yellow-600" : "text-muted-foreground"}`}>
          {statusLabel(status)}
        </span>
      </div>
      {desc && (
        <div className="mt-2">
          <div className="text-xs font-medium">{desc.label}</div>
          <div className="text-xs text-muted-foreground">{desc.suggestion}</div>
        </div>
      )}
      {errorMessage && (
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-[11px] font-mono">
          {errorMessage}
        </pre>
      )}
      {requestId && (
        <div className="mt-2 text-[11px] font-mono text-muted-foreground break-all">req: {requestId}</div>
      )}
    </div>
  );
}