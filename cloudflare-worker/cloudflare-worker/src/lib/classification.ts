import type { ErrorType } from "../types";

export function classifyError(err: unknown, html?: string): { error_type: ErrorType; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = (msg + " " + (html || "")).toLowerCase();

  if (/fs\.mkdtemp|\[unenv\]|is not implemented/i.test(lower)) {
    return {
      error_type: "runtime_incompatibility",
      message: "Runtime do Worker não suporta esta API (fs.mkdtemp/unenv). Atualizar @cloudflare/playwright e usar browser.newPage() direto sem newContext().",
    };
  }
  if (/connectovercdp|cdp.*error|protocol error.*target|browsertype\.connect/i.test(lower)) {
    return {
      error_type: "browser_unavailable",
      message: "Falha ao conectar ao Browser Rendering (CDP). Verificar binding 'gestaoez' e versão do @cloudflare/playwright.",
    };
  }
  if (/captcha|recaptcha|hcaptcha|i'm not a robot|não sou um robô/i.test(lower)) {
    return { error_type: "captcha_detected", message: "Portal exigiu captcha" };
  }
  if (/429|rate.?limit|too many requests|quota.*exceed/i.test(lower)) {
    return { error_type: "rate_limited", message: "Cloudflare Browser Rendering rate limit atingido. Reduza concorrência ou aguarde." };
  }
  if (/unable to create.*browser|browser.*unavailable|workers.*browser|browser binding|browser rendering.*not/i.test(lower)) {
    return { error_type: "browser_unavailable", message: "Browser Rendering indisponível ou binding incorreto." };
  }
  if (/cannot read propert.*of null|reading 'accept'|reading "accept"|null \(reading/i.test(lower)) {
    return { error_type: "browser_unavailable", message: "Falha ao iniciar Browser Rendering (binding nulo)." };
  }
  if (/callback.*(failed|error|non-2xx)|cf-final-callback|cf-progress-callback/i.test(lower)) {
    return { error_type: "callback_error", message: msg };
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