export interface TimelineStep {
  step: string;
  label: string;
  level: "info" | "warning" | "error";
  message: string;
  at: string;
}

const STEP_LABELS: Record<string, string> = {
  navigate: "Abrindo portal",
  submit: "Enviando CNPJ",
  parse: "Extraindo dados",
  artifact_uploaded: "Evidência salva",
  done: "Consulta concluída",
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