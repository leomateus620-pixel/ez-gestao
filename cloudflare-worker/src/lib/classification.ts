import type { ErrorType } from "../types";

export function classifyError(err: unknown, html?: string): { error_type: ErrorType; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = (msg + " " + (html || "")).toLowerCase();

  if (/captcha|recaptcha|hcaptcha|i'm not a robot|não sou um robô/i.test(lower)) {
    return { error_type: "captcha_detected", message: "Portal exigiu captcha" };
  }
  if (/timeout|timed out|navigation timeout/i.test(lower)) {
    return { error_type: "timeout", message: msg };
  }
  if (/cnpj.*(não|nao).*(encontrado|cadastrado|consta)|não consta no cadastro/i.test(lower)) {
    return { error_type: "cnpj_not_found", message: "CNPJ não encontrado no portal" };
  }
  if (/serviço.*indispon|sistema.*fora|503|502|gateway/i.test(lower)) {
    return { error_type: "portal_unavailable", message: "Portal indisponível" };
  }
  if (/selector|element not found|waiting for/i.test(lower)) {
    return { error_type: "layout_changed", message: "Layout do portal mudou" };
  }
  if (/parse|json|unexpected token/i.test(lower)) {
    return { error_type: "parsing_error", message: msg };
  }
  return { error_type: "unknown", message: msg.slice(0, 300) };
}