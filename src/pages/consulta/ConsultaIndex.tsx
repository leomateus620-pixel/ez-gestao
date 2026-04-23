import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, RefreshCw } from "lucide-react";
import { CnpjInput } from "@/features/consulta/components/CnpjInput";
import { CompanyResultCard } from "@/features/consulta/components/CompanyResultCard";
import { CndResultCard } from "@/features/consulta/components/CndResultCard";
import { ExecutionTimeline } from "@/features/consulta/components/ExecutionTimeline";
import { ArtifactViewer } from "@/features/consulta/components/ArtifactViewer";
import { CacheBadge } from "@/features/consulta/components/CacheBadge";
import { StatusBadge } from "@/features/consulta/components/StatusBadge";
import { useDispatchLookup, useLookupStatus, useRetryLookup } from "@/features/consulta/hooks/useLookup";
import { isValidCnpj } from "@/features/consulta/services/cnpj-utils";
import { describeError } from "@/features/consulta/services/classification";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function ConsultaIndex() {
  const [cnpj, setCnpj] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [active, setActive] = useState<{ request_id: string; type: "cnpj" | "cnd"; from_cache: boolean } | null>(null);

  const dispatch = useDispatchLookup();
  const status = useLookupStatus(active?.request_id ?? null, active?.type ?? "cnpj");
  const retry = useRetryLookup();

  const handle = async (type: "cnpj" | "cnd") => {
    if (!isValidCnpj(cnpj)) { toast.error("CNPJ inválido"); return; }
    try {
      const r = await dispatch.mutateAsync({ cnpj, type, force_refresh: forceRefresh });
      setActive({ request_id: r.request_id, type, from_cache: r.from_cache });
      if (r.from_cache) toast.success("Resultado em cache");
      else if (r.status === "failed") toast.error("Falha ao despachar");
      else toast.message("Consulta iniciada", { description: `Job ${r.job_id?.slice(0, 8) ?? "—"}` });
    } catch (e: any) {
      toast.error("Erro ao iniciar consulta", { description: e?.message });
    }
  };

  const data: any = status.data;
  const reqStatus = data?.request?.status;
  const isFinal = reqStatus && ["success", "failed", "manual_required", "partial"].includes(reqStatus);
  const errMeta = data?.job?.error_type ? describeError(data.job.error_type) : null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Consulta CNPJ / CND</h1>
        <p className="text-sm text-muted-foreground">Execução real via Cloudflare Worker + Browser Rendering. Cache: CNPJ 7d · CND até validade.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Nova consulta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs">CNPJ</Label>
              <CnpjInput value={cnpj} onChange={(raw) => setCnpj(raw)} disabled={dispatch.isPending} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="force" checked={forceRefresh} onCheckedChange={setForceRefresh} />
              <Label htmlFor="force" className="text-xs">Forçar refresh</Label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handle("cnpj")} disabled={dispatch.isPending}>
              <Search className="h-4 w-4 mr-1" /> Consultar CNPJ
            </Button>
            <Button variant="secondary" onClick={() => handle("cnd")} disabled={dispatch.isPending}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Consultar CND
            </Button>
            {active && (
              <Button variant="outline" onClick={() => retry.mutate({ request_id: active.request_id, type: active.type })} disabled={retry.isPending || !isFinal}>
                <RefreshCw className="h-4 w-4 mr-1" /> Reprocessar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Execução
              <StatusBadge status={reqStatus} />
              <CacheBadge fromCache={active.from_cache} cacheValidUntil={data?.result?.cache_valid_until} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="result">
              <TabsList>
                <TabsTrigger value="result">Resultado</TabsTrigger>
                <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
                <TabsTrigger value="artifacts">Evidências</TabsTrigger>
                <TabsTrigger value="raw">Técnico</TabsTrigger>
              </TabsList>
              <TabsContent value="result" className="pt-4 space-y-4">
                {active.type === "cnpj" && data?.result && <CompanyResultCard result={data.result} />}
                {active.type === "cnd" && data?.result && <CndResultCard result={data.result} />}
                {!data?.result && reqStatus === "running" && <p className="text-sm text-muted-foreground">Executando consulta no portal…</p>}
                {errMeta && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <div className="font-medium">{errMeta.label}</div>
                    <div className="text-xs text-muted-foreground">{data?.job?.error_message}</div>
                    <div className="text-xs mt-1">Sugestão: {errMeta.suggestion}</div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="timeline" className="pt-4">
                <ExecutionTimeline
                  logs={data?.logs}
                  isFinal={isFinal}
                  cacheHit={!!data?.request?.cache_hit}
                />
              </TabsContent>
              <TabsContent value="artifacts" className="pt-4">
                <ArtifactViewer artifacts={data?.artifacts} />
              </TabsContent>
              <TabsContent value="raw" className="pt-4">
                <pre className="text-[10px] bg-muted/50 rounded-md p-3 overflow-auto max-h-96">{JSON.stringify(data, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}