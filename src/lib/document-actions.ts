import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Documento } from '@/data/types';

type DocumentAction = 'view' | 'download';

function isPublicUrl(value: string) {
  return /^(https?:|blob:|data:)/i.test(value);
}

async function resolveDocumentUrl(documento: Documento) {
  const storedUrl = documento.url?.trim();
  if (!storedUrl || storedUrl === '#') {
    throw new Error('Arquivo ainda não possui URL de armazenamento.');
  }
  if (isPublicUrl(storedUrl)) return storedUrl;

  const { data, error } = await supabase.storage
    .from('empresa-documentos')
    .createSignedUrl(storedUrl, 60);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Não foi possível gerar o link temporário.');
  }
  return data.signedUrl;
}

export async function openDocument(documento: Documento | undefined, action: DocumentAction = 'view') {
  if (!documento) {
    toast.error('Documento não encontrado');
    return;
  }

  try {
    const url = await resolveDocumentUrl(documento);
    if (action === 'download') {
      const link = window.document.createElement('a');
      link.href = url;
      link.download = documento.nome || 'documento.pdf';
      link.rel = 'noopener noreferrer';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    toast.error(action === 'download' ? 'Download indisponível' : 'PDF indisponível', {
      description: error instanceof Error ? error.message : 'Verifique se o arquivo foi enviado corretamente.',
    });
  }
}
