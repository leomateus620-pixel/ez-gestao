export const acceptedTaxReformMimeTypes = '.pdf,.xls,.xlsx,.csv,image/png,image/jpeg,image/webp';
export const allowedTaxReformExtensions = ['pdf', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'webp'];

export function isValidTaxReformCnpj(value: string) {
  return value.replace(/\D/g, '').length === 14;
}

export function isValidTaxReformAnalysisYear(value: number) {
  return Number.isInteger(value) && value >= 2026 && value <= 2100;
}
