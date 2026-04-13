export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }
  return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
}

export function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weight[i];
  let remainder = sum % 11;
  const d1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[12]) !== d1) return false;

  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weight[i];
  remainder = sum % 11;
  const d2 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(digits[13]) !== d2) return false;

  return true;
}

export function maskCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})/, '$1.')
    .replace(/^(\d{2})\.(\d{3})/, '$1.$2.')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function maskPhone(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/^(\d{2})/, '($1) ')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR');
}

export function getRegimeLabel(regime: string): string {
  const labels: Record<string, string> = {
    simples_nacional: 'Simples Nacional',
    lucro_presumido: 'Lucro Presumido',
    lucro_real: 'Lucro Real',
    mei: 'MEI',
  };
  return labels[regime] || regime;
}

export function getCNDTipoLabel(tipo: string): string {
  const labels: Record<string, string> = {
    receita_federal: 'Receita Federal',
    fgts: 'FGTS',
    sefaz: 'SEFAZ',
    municipal: 'Municipal',
    trabalhista: 'Trabalhista',
    personalizada: 'Personalizada',
  };
  return labels[tipo] || tipo;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    valida: 'Válida',
    vencendo: 'Vencendo',
    vencida: 'Vencida',
    pendente: 'Pendente',
    erro: 'Erro',
    nao_aplicavel: 'N/A',
    ativa: 'Ativa',
    pausada: 'Pausada',
    arquivada: 'Arquivada',
  };
  return labels[status] || status;
}
