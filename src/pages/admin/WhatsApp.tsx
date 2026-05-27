import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppMessage } from '@/services/whatsapp';
import { getCurrentRole } from '@/lib/permissions';
import { useToast } from '@/hooks/use-toast';

const statusColor: Record<string, 'default' | 'secondary' | 'destructive'> = { queued: 'secondary', sending: 'secondary', sent: 'default', delivered: 'default', read: 'default', failed: 'destructive' };

export default function WhatsAppPage() {
  const { toast } = useToast();
  const canAccess = getCurrentRole() === 'admin';
  const [messages, setMessages] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    let q = (supabase as any).from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(100);
    if (status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    setMessages(data ?? []);
  };
  useEffect(() => { if (canAccess) load(); }, [status]);

  const testConnection = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-service-health', { method: 'GET' });
    setBusy(false);
    if (error) return toast({ title: 'Falha ao testar', description: error.message, variant: 'destructive' });
    if (!data?.configured) return toast({ title: 'Integração não configurada', description: 'Defina WHATSAPP_SERVICE_URL e WHATSAPP_SERVICE_SECRET no Supabase.', variant: 'destructive' });
    if (!data?.ok) return toast({ title: 'Serviço externo offline', description: data?.error || 'Verifique o servidor Node.js externo.', variant: 'destructive' });
    toast({ title: 'Conexão OK', description: 'Serviço WhatsApp está online.' });
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await sendWhatsAppMessage({ phone: '11999999999', message: 'Teste de integração WhatsApp.', sourceType: 'test' });
      toast({ title: 'Mensagem enviada', description: 'Mensagem de teste registrada e enviada.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Falha no envio', description: e?.message || 'Erro inesperado.', variant: 'destructive' });
    }
    setBusy(false);
  };

  const filtered = useMemo(() => messages.filter((m) => `${m.recipient_name || ''} ${m.phone || ''}`.toLowerCase().includes(search.toLowerCase())), [messages, search]);
  if (!canAccess) return <div className="glass-card p-6">Acesso restrito.</div>;

  return <div className="space-y-6 animate-fade-in">
    <PageHeader title="WhatsApp" subtitle="Integração externa whatsapp-webjs" />
    <div className="glass-card p-4 flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={testConnection} disabled={busy}>Testar conexão</Button>
      <Button size="sm" onClick={sendTest} disabled={busy}>Enviar mensagem teste</Button>
    </div>
    <div className="glass-card p-4 space-y-3">
      <div className="flex gap-2 flex-wrap"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por telefone/nome" className="max-w-xs" />
      {['all','queued','sent','delivered','read','failed'].map((s) => <Button key={s} size="sm" variant={status===s?'default':'outline'} onClick={() => setStatus(s)}>{s}</Button>)}</div>
      {filtered.length === 0 ? <p className="text-sm text-muted-foreground">Sem mensagens ainda.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Destinatário</th><th>Telefone</th><th>Status</th><th>Origem</th><th>Data</th><th>Erro</th><th /></tr></thead><tbody>{filtered.map((m) => <tr key={m.id}><td>{m.recipient_name || '—'}</td><td>{m.normalized_phone}</td><td><Badge variant={statusColor[m.status] || 'secondary'}>{m.status}</Badge></td><td>{m.source_type || 'manual'}</td><td>{new Date(m.created_at).toLocaleString('pt-BR')}</td><td>{m.last_error || '—'}</td><td>{m.status==='failed' && <Button size="sm" variant="outline" onClick={() => sendWhatsAppMessage({ phone: m.phone, recipientName: m.recipient_name, message: m.message, sourceType: m.source_type || 'manual', sourceId: m.source_id, metadata: { ...(m.metadata || {}), retry_of: m.id } }).then(load)}>Reenviar</Button>}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}
