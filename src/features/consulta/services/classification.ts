export const ERROR_LABELS: Record<string, { label: string; suggestion: string }> = {
  captcha_detected: { label: "Captcha detectado", suggestion: "Tente novamente em alguns minutos ou faça consulta manual." },
  layout_changed: { label: "Layout do portal mudou", suggestion: "Equipe técnica precisa atualizar o conector." },
  timeout: { label: "Tempo esgotado", suggestion: "Portal lento. Tente reprocessar." },
  cnpj_not_found: { label: "CNPJ não encontrado", suggestion: "Confirme se o CNPJ existe na Receita." },
  portal_unavailable: { label: "Portal indisponível", suggestion: "Aguarde restabelecimento do serviço." },
  navigation_error: { label: "Erro de navegação", suggestion: "Tente reprocessar." },
  parsing_error: { label: "Erro ao extrair dados", suggestion: "Layout pode ter mudado. Reportar." },
  worker_unreachable: { label: "Worker Cloudflare inalcançável", suggestion: "Verifique deploy e secrets do Worker." },
  worker_not_configured: { label: "Worker não configurado", suggestion: "Defina secrets de URL e HMAC." },
  unknown: { label: "Falha desconhecida", suggestion: "Veja logs técnicos." },
};

export function describeError(errorType?: string | null) {
  if (!errorType) return ERROR_LABELS.unknown;
  return ERROR_LABELS[errorType] || ERROR_LABELS.unknown;
}