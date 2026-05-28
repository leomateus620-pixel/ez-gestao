export interface FatorRParseResult {
  fatorRValue: number | null;
  fatorRPercent: number | null;
  payroll12m: number | null;
  revenue12m: number | null;
  referenceMonth: number | null;
  referenceYear: number | null;
  companyName: string | null;
  cnpj: string | null;
  confidence: number;
  warnings: string[];
}

const pctToDecimal = (value: string) => {
  const normalized = value.trim().replace('%', '').replace('.', '').replace(',', '.');
  const raw = Number(normalized);
  if (Number.isNaN(raw)) return null;
  return value.includes('%') || raw > 1 ? raw / 100 : raw;
};

export function parseFatorRFromText(rawText: string, fileName = ''): FatorRParseResult {
  const text = `${fileName}\n${rawText}`;
  const warnings: string[] = [];

  const cnpj = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0] ?? null;
  const fatorMatch = text.match(/fator\s*r[^\d]*(\d{1,2}(?:[\.,]\d{1,2})?%?|0[\.,]\d{1,4})/i);
  const fs12Match = text.match(/(?:FS12|folha de sal[aá]rios)[^\d]*(\d[\d\.,]*)/i);
  const rbt12Match = text.match(/(?:RBT12|receita bruta acumulada)[^\d]*(\d[\d\.,]*)/i);
  const ymMatch = text.match(/(20\d{2})[\/_\-\s](0?[1-9]|1[0-2])/) || text.match(/(0?[1-9]|1[0-2])[\/_\-\s](20\d{2})/);

  const fatorRValue = fatorMatch ? pctToDecimal(fatorMatch[1]) : null;
  if (fatorRValue === null) warnings.push('Fator R não identificado com alta confiança.');

  let referenceYear: number | null = null;
  let referenceMonth: number | null = null;
  if (ymMatch) {
    const [a,b] = [ymMatch[1], ymMatch[2]];
    if (Number(a) > 12) {
      referenceYear = Number(a); referenceMonth = Number(b);
    } else {
      referenceMonth = Number(a); referenceYear = Number(b);
    }
  }

  const numeric = (v?: string) => (v ? Number(v.replace(/\./g, '').replace(',', '.')) : null);
  const payroll12m = numeric(fs12Match?.[1]);
  const revenue12m = numeric(rbt12Match?.[1]);
  const confidence = fatorRValue === null ? 0.35 : fs12Match || rbt12Match ? 0.9 : 0.78;

  return {
    fatorRValue,
    fatorRPercent: fatorRValue !== null ? fatorRValue * 100 : null,
    payroll12m,
    revenue12m,
    referenceMonth,
    referenceYear,
    companyName: null,
    cnpj,
    confidence,
    warnings,
  };
}
