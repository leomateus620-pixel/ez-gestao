export interface TimelineStep {
  step: string;
  label: string;
  level: "info" | "warning" | "error";
  message: string;
  at: string;
}

const STEP_LABELS: Record<string, string> = {
  navigate: "Abrindo portal",
  navigate_spa: "Abrindo SPA da Receita",
  navigate_cndt: "Abrindo CNDT",
  submit: "Enviando CNPJ",
  submit_spa: "Enviando consulta (SPA)",
  submit_cndt: "Enviando CNDT",
  parse: "Extraindo dados",
  enter_form: "Acessando formulário",
  fill_cnpj: "Preenchendo CNPJ",
  fill_cnpj_spa: "Preenchendo CNPJ (SPA)",
  fill_cnpj_cndt: "Preenchendo CNPJ (CNDT)",
  solve_captcha: "Resolvendo captcha",
  solve_captcha_spa: "Resolvendo captcha (SPA)",
  solve_captcha_cndt: "Resolvendo captcha (CNDT)",
  wait_result: "Aguardando resultado",
  wait_result_spa: "Aguardando resultado (SPA)",
  wait_result_cndt: "Aguardando resultado (CNDT)",
  fallback_to_legacy: "Fallback para portal legado",
  download_pdf: "Baixando PDF",
  download_pdf_spa: "Baixando PDF (SPA)",
  download_pdf_cndt: "Baixando PDF (CNDT)",
  retry_rate_limit: "Retry por limite de taxa",
  artifact_uploaded: "Evidência salva",
  done: "Consulta concluída",
  done_spa: "Consulta concluída (SPA)",
  done_cndt: "Consulta CNDT concluída",
  progress: "Progresso",
};

export function buildTimeline(logs: any[] = []): TimelineStep[] {
  return (logs || []).map((l) => ({
    step: l.step,
    label: STEP_LABELS[l.step] || l.step,
    level: (l.level as TimelineStep["level"]) || "info",
    message: l.message || "",
    at: l.created_at,
  }));
}