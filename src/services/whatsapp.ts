import { supabase } from '@/integrations/supabase/client';

type SendWhatsAppInput = {
  phone: string;
  recipientName?: string;
  message: string;
  sourceType?: 'demand' | 'invoice' | 'manual' | 'test';
  sourceId?: string;
  metadata?: Record<string, unknown>;
};

export async function sendWhatsAppMessage(input: SendWhatsAppInput) {
  const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
    body: {
      phone: input.phone,
      recipient_name: input.recipientName,
      message: input.message,
      source_type: input.sourceType ?? 'manual',
      source_id: input.sourceId,
      metadata: input.metadata ?? {},
    },
  });
  if (error) throw error;
  return data;
}
