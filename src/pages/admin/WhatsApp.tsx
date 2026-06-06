import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppMessage } from '@/services/whatsapp';
import { getCurrentRole } from '@/lib/permissions';
import { toast } from 'sonner';

const statusColor: Record<string, 'default' | 'secondary' | 'destructive'> = { queued: 'secondary', sending: 'secondary', sent: 'default', delivered: 'default', read: 'default', failed: 'destructive' };

export default function WhatsAppPage() {
  const canAccess = getCurrentRole() === 'admin';
  const [messages, setMessages] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [testingConnection, setTestingConnection] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const load = async () => {
    let q = (supabase as any).from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(100);
    if (status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    setMessages(data ?? []);
  };
  useEffect(() => { if (canAccess) load(); }, [status]);

  const filtered = useMemo(() => messages.filter((m) => `${m.recipient_name || ''} ${m.phone || ''}`.toLowerCase().includes(search.toLowerCase())), [messages, search]);
  const testConnection = async () => {
    setTestingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke('integracoes-status');
      if (error) throw error;
      const connected = Boolean((data as Record<string, boolean> | null)?.twilio_whatsapp);
      if (connected) {
        toast.success('WhatsApp conectado', { description: 'A integração Twilio está configurada no servidor.' });
      } else {
        toast.warning('WhatsApp desconectado', { description: 'Configure os secrets da integração antes de enviar mensagens reais.' });
      }
    } catch (error) {
      toast.error('Falha ao testar conexão', {
        description: error instanceof Error ? error.message : 'Não foi possível consultar integracoes-status.',
      });
    } finally {
      setTestingConnection(false);
    }
  };
  const sendTestMessage = async () => {
    setSendingTest(true);
    try {
      await sendWhatsAppMessage({ phone: '11999999999', message: 'Teste de integração WhatsApp.', sourceType: 'test' });
      toast.success('Mensagem teste enviada');
      await load();
    } catch (error) {
      toast.error('Falha no envio teste', {
        description: error instanceof Error ? error.message : 'Verifique a função send-whatsapp-message.',
      });
    } finally {
      setSendingTest(false);
    }
  };
  if (!canAccess) return <div className="glass-card p-6">Acesso restrito.</div>;

  return <div className="space-y-6 animate-fade-in">
    <PageHeader title="WhatsApp" subtitle="Integração externa whatsapp-webjs" />
    <div className="glass-card p-4 flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={testConnection} disabled={testingConnection}>{testingConnection ? 'Testando...' : 'Testar conexão'}</Button>
      <Button size="sm" onClick={sendTestMessage} disabled={sendingTest}>{sendingTest ? 'Enviando...' : 'Enviar mensagem teste'}</Button>
    </div>
    <div className="glass-card p-4 space-y-3">
      <div className="flex gap-2 flex-wrap"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por telefone/nome" className="max-w-xs" />
      {['all','queued','sent','delivered','read','failed'].map((s) => <Button key={s} size="sm" variant={status===s?'default':'outline'} onClick={() => setStatus(s)}>{s}</Button>)}</div>
      {filtered.length === 0 ? <p className="text-sm text-muted-foreground">Sem mensagens ainda.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Destinatário</th><th>Telefone</th><th>Status</th><th>Origem</th><th>Data</th><th>Erro</th><th /></tr></thead><tbody>{filtered.map((m) => <tr key={m.id}><td>{m.recipient_name || '—'}</td><td>{m.normalized_phone}</td><td><Badge variant={statusColor[m.status] || 'secondary'}>{m.status}</Badge></td><td>{m.source_type || 'manual'}</td><td>{new Date(m.created_at).toLocaleString('pt-BR')}</td><td>{m.last_error || '—'}</td><td>{m.status==='failed' && <Button size="sm" variant="outline" onClick={() => sendWhatsAppMessage({ phone: m.phone, recipientName: m.recipient_name, message: m.message, sourceType: m.source_type || 'manual', sourceId: m.source_id, metadata: { ...(m.metadata || {}), retry_of: m.id } }).then(load)}>Reenviar</Button>}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}
