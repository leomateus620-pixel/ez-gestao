import { supabase } from "@/integrations/supabase/client";

export type LookupType = "cnpj" | "cnd";

export interface DispatchInput {
  cnpj: string;
  type: LookupType;
  force_refresh?: boolean;
}

export interface DispatchResult {
  request_id: string;
  job_id?: string;
  from_cache: boolean;
  correlation_id: string;
  status: string;
  message?: string;
  error?: string;
}

export async function dispatchLookup(input: DispatchInput): Promise<DispatchResult> {
  const { data, error } = await supabase.functions.invoke("lookup-dispatcher", {
    body: input,
  });
  if (error) throw error;
  return data as DispatchResult;
}

export async function fetchLookupStatus(request_id: string, type: LookupType) {
  // Use direct fetch because supabase.functions.invoke doesn't support query strings on GET.
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-status?request_id=${encodeURIComponent(request_id)}&type=${type}`;
  const r = await fetch(url, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
    },
  });
  if (!r.ok) throw new Error(`status_${r.status}`);
  return r.json();
}

export async function retryLookup(request_id: string, type: LookupType) {
  const { data, error } = await supabase.functions.invoke("lookup-retry", {
    body: { request_id, type },
  });
  if (error) throw error;
  return data;
}

export async function fetchProviderHealth() {
  const { data, error } = await supabase.functions.invoke("provider-health-summary", {
    body: null,
    method: "GET",
  } as never);
  if (error) throw error;
  return data;
}

export async function runDryRunZimmermann() {
  const { data, error } = await supabase.functions.invoke("dry-run-zimmermann", {
    body: {},
  });
  if (error) throw error;
  return data;
}

export async function fetchDryRunStatus() {
  const { data, error } = await supabase.functions.invoke("dry-run-zimmermann-status", {
    body: {},
  });
  if (error) throw error;
  return data as {
    in_progress: boolean;
    passed: boolean;
    cnpj_request_id?: string;
    cnd_request_id?: string;
    cnpj_status?: string;
    cnd_status?: string;
    cnpj_error_type?: string | null;
    cnpj_error_message?: string | null;
    cnd_error_type?: string | null;
    cnd_error_message?: string | null;
    report_path?: string | null;
    signed_url?: string | null;
    last_run_at?: string | null;
  };
}