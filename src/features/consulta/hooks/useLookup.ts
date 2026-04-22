import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  dispatchLookup, fetchLookupStatus, retryLookup,
  fetchProviderHealth, runDryRunZimmermann,
  type DispatchInput, type LookupType,
} from "../services/dispatcher";

export function useDispatchLookup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DispatchInput) => dispatchLookup(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lookup-history"] });
    },
  });
}

export function useLookupStatus(request_id: string | null, type: LookupType) {
  const [pollMs, setPollMs] = useState(1500);
  const startedAt = useRef(Date.now());

  const query = useQuery({
    queryKey: ["lookup-status", type, request_id],
    queryFn: () => fetchLookupStatus(request_id!, type),
    enabled: !!request_id,
    refetchInterval: pollMs,
  });

  // Adaptive backoff
  useEffect(() => {
    const elapsed = Date.now() - startedAt.current;
    if (elapsed > 30_000 && pollMs !== 10_000) setPollMs(10_000);
    else if (elapsed > 10_000 && pollMs !== 3_000) setPollMs(3_000);
    const status = (query.data as any)?.request?.status;
    if (status && ["success", "failed", "manual_required", "partial"].includes(status)) {
      setPollMs(0);
    }
  }, [query.data, pollMs]);

  // Realtime subscription on the relevant tables
  useEffect(() => {
    if (!request_id) return;
    const channel = supabase
      .channel(`lookup-${type}-${request_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: type === "cnpj" ? "company_lookup_requests" : "cnd_lookup_requests", filter: `id=eq.${request_id}` }, () => query.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_job_logs" }, () => query.refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [request_id, type]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export function useRetryLookup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ request_id, type }: { request_id: string; type: LookupType }) => retryLookup(request_id, type),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lookup-status", vars.type, vars.request_id] });
    },
  });
}

export function useProviderHealth() {
  return useQuery({
    queryKey: ["provider-health"],
    queryFn: fetchProviderHealth,
    refetchInterval: 15_000,
  });
}

export function useLookupHistory() {
  return useQuery({
    queryKey: ["lookup-history"],
    queryFn: async () => {
      const [{ data: cnpjReqs }, { data: cndReqs }] = await Promise.all([
        supabase.from("company_lookup_requests").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("cnd_lookup_requests").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      return {
        cnpj: cnpjReqs || [],
        cnd: cndReqs || [],
      };
    },
  });
}

export function useExceptionsCenter() {
  return useQuery({
    queryKey: ["lookup-exceptions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("automation_exceptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });
}

export function useDryRun() {
  return useMutation({ mutationFn: () => runDryRunZimmermann() });
}

export function useHmacDiagnose() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("consulta-hmac-diagnose", { body: {} });
      if (error) throw error;
      return data as {
        ok: boolean;
        signatures_match?: boolean;
        fingerprints_match?: boolean;
        local?: { signature: string; fingerprint: string; secret_length: number };
        worker?: { signature: string; fingerprint: string; secret_length: number; has_secret: boolean };
        message: string;
        reason?: string;
      };
    },
  });
}

export function useFeatureFlag(key: string) {
  return useQuery({
    queryKey: ["feature-flag", key],
    queryFn: async () => {
      const { data } = await supabase.from("feature_flags").select("*").eq("key", key).maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });
}

export function useDryRunStatus() {
  return useQuery({
    queryKey: ["dry-run-status"],
    queryFn: async () => {
      const { data } = await supabase.from("automation_config_kv").select("*").eq("key", "dry_run_zimmermann").maybeSingle();
      return data;
    },
  });
}