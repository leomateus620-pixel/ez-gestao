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
  const { data, error } = await supabase.functions.invoke("lookup-status", {
    body: null,
    method: "GET",
    headers: {},
    // Supabase functions client doesn't directly support query strings;
    // we use fetch with the public URL.
  } as never).catch(() => ({ data: null, error: null }));
  if (data) return data;
  // Fallback to direct fetch for GET with query params
  const projectRef = (import.meta.env.VITE_SUPABASE_URL as string).replace(/^https?:\/\//, "").split(".")[0];
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