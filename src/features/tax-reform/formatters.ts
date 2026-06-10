export function formatTaxReformDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function formatTaxReformDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export function formatTaxReformMoney(value?: number) {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
