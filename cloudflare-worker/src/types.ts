export interface Env {
  gestaoez: Fetcher; // Browser Rendering binding
  LOVABLE_HMAC_SECRET: string;
  CALLBACK_HMAC_SECRET: string;
  CALLBACK_BASE_URL: string;
  VERSION: string;
}

export interface ExecuteJobPayload {
  job_id: string;
  job_type: "cnpj_lookup" | "cnd_lookup";
  cnpj: string;
  correlation_id: string;
  callback_base?: string;
}

export type ErrorType =
  | "captcha_detected"
  | "layout_changed"
  | "timeout"
  | "cnpj_not_found"
  | "portal_unavailable"
  | "navigation_error"
  | "parsing_error"
  | "unknown";