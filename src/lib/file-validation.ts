const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePDF(file: File): FileValidationResult {
  if (file.type !== 'application/pdf') {
    return { valid: false, error: 'Apenas arquivos PDF são permitidos.' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
  }
  if (file.size === 0) {
    return { valid: false, error: 'Arquivo vazio.' };
  }
  return { valid: true };
}

export function validateFileExtension(name: string): FileValidationResult {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Extensão não permitida. Permitidos: ${ALLOWED_EXTENSIONS.join(', ')}` };
  }
  return { valid: true };
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w\s.-]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}
