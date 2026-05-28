export const ERROR_LABELS: Record<string, { label: string; suggestion: string }> = {
  captcha_detected: {
    label: "Captcha detectado",
    suggestion: "Receita exigiu captcha. Tente novamente em 5–10 min ou faça consulta manual em solucoes.receita.fazenda.gov.br.",
  },
  captcha_unsolvable: {
    label: "OCR não leu o captcha",
    suggestion: "OCR automático falhou após retries. Tente novamente em 1 min ou faça consulta manual.",
  },
  captcha_failed: {
    label: "Captcha rejeitado pelo portal",
    suggestion: "OCR resolveu mas o portal rejeitou o código. Tente novamente — geralmente acerta na 2ª tentativa.",
  },
  layout_changed: {
    label: "Layout do portal mudou",
    suggestion: "O layout do portal CND mudou. O conector precisa ser atualizado. Reporte ao time técnico com o screenshot da etapa final.",
  },
  spa_layout_changed: {
    label: "SPA nova mudou — usando portal legado",
    suggestion: "A SPA nova da Receita mudou layout. O conector caiu automaticamente para o portal legado. Reporte ao time técnico para atualizar os seletores da SPA.",
  },
  timeout: { label: "Tempo esgotado", suggestion: "Portal lento. Tente reprocessar." },
  cnpj_not_found: { label: "CNPJ não encontrado", suggestion: "Confirme se o CNPJ existe na Receita." },
  portal_unavailable: { label: "Portal indisponível", suggestion: "Aguarde restabelecimento do serviço." },
  navigation_error: { label: "Erro de navegação", suggestion: "Tente reprocessar." },
  parsing_error: { label: "Erro ao extrair dados", suggestion: "Layout pode ter mudado. Reportar." },
  worker_unreachable: { label: "Worker Cloudflare inalcançável", suggestion: "Verifique deploy e secrets do Worker." },
  worker_auth_failed: { label: "Worker rejeitou HMAC", suggestion: "Os segredos LOVABLE_HMAC_SECRET (Worker) e CLOUDFLARE_WORKER_HMAC_SECRET (Lovable) estão diferentes. Rode 'Diagnosticar HMAC' em /consulta/saúde." },
  worker_not_configured: { label: "Worker não configurado", suggestion: "Defina secrets de URL e HMAC." },
  runtime_incompatibility: {
    label: "Incompatibilidade de runtime",
    suggestion: "Atualizar @cloudflare/playwright no Worker e remover browser.newContext(). Após corrigir, rode 'wrangler deploy'.",
  },
  rate_limited: {
    label: "Limite de taxa atingido",
    suggestion: "Browser Rendering atingiu o limite. Aguarde alguns minutos e reprocesse, ou reduza a concorrência.",
  },
  browser_unavailable: {
    label: "Browser Rendering indisponível",
    suggestion: "Verifique o binding 'gestaoez' no Worker e a versão do @cloudflare/playwright. Rode 'wrangler deploy' se mudou código.",
  },
  callback_error: {
    label: "Erro no callback",
    suggestion: "Worker processou mas falhou ao retornar o resultado. Verifique CALLBACK_BASE_URL e CALLBACK_HMAC_SECRET.",
  },
  manual_required: {
    label: "Requer ação manual",
    suggestion: "Portal exige interação humana (captcha). Faça consulta manual ou tente mais tarde.",
  },
  rate_limited_after_retry: {
    label: "Limite de taxa persistente",
    suggestion: "Mesmo após retry com backoff o portal segue rate-limited. Aguarde alguns minutos.",
  },
  unknown: { label: "Falha desconhecida", suggestion: "Veja logs técnicos." },
};

export function describeError(errorType?: string | null) {
  if (!errorType) return ERROR_LABELS.unknown;
  return ERROR_LABELS[errorType] || ERROR_LABELS.unknown;
}