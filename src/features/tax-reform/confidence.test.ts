import { describe, expect, it } from 'vitest';
import { computeConfidenceLevel, computeConfidenceReasons } from './confidence';
import type { DocumentLike } from './types';

const doc = (documentType: string, overrides: Partial<DocumentLike> = {}): DocumentLike => ({
  documentType,
  uploadStatus: 'enviado',
  storagePath: `path/${documentType}`,
  ...overrides,
});

describe('computeConfidenceLevel', () => {
  it('returns baixa when no primary documents are uploaded', () => {
    expect(computeConfidenceLevel([])).toBe('baixa');
    expect(computeConfidenceLevel([doc('outros')])).toBe('baixa');
  });

  it('returns media for 1-2 primary documents', () => {
    expect(computeConfidenceLevel([doc('dre')])).toBe('media');
    expect(computeConfidenceLevel([doc('dre'), doc('balancete')])).toBe('media');
  });

  it('returns alta for 3+ primary documents', () => {
    expect(computeConfidenceLevel([doc('dre'), doc('balancete'), doc('fornecedores')])).toBe('alta');
  });

  it('forces alta when DRE + PGDAS + faturamento_cliente combo is present', () => {
    expect(computeConfidenceLevel([doc('dre'), doc('pgdas'), doc('faturamento_cliente')])).toBe('alta');
  });

  it('ignores documents with upload_status erro_upload', () => {
    const docs: DocumentLike[] = [
      doc('dre', { uploadStatus: 'erro_upload' }),
      doc('balancete', { uploadStatus: 'erro_upload' }),
      doc('pgdas', { uploadStatus: 'erro_upload' }),
    ];
    expect(computeConfidenceLevel(docs)).toBe('baixa');
  });

  it('reasons mention combo when applicable', () => {
    const reasons = computeConfidenceReasons([doc('dre'), doc('pgdas'), doc('faturamento_cliente')]);
    expect(reasons.some((r) => r.includes('DRE + PGDAS'))).toBe(true);
  });
});