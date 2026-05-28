import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FolderSync, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Classifica() {
  const db = supabase as any;
  const [documents, setDocuments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);

  const load = async () => {
    const [d, i, r, q, l] = await Promise.all([
      db.from('classifica_documents').select('*').order('created_at', { ascending: false }).limit(20),
      db.from('classifica_invoice_items').select('*').order('created_at', { ascending: false }).limit(50),
      db.from('classifica_rules').select('*').order('created_at', { ascending: false }).limit(30),
      db.from('classifica_review_queue').select('*').order('created_at', { ascending: false }).limit(30),
      db.from('classifica_processing_logs').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    setDocuments(d.data ?? []); setItems(i.data ?? []); setRules(r.data ?? []); setQueue(q.data ?? []); setLogs(l.data ?? []);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: documents.length,
    entradas: documents.filter((d) => d.invoice_type === 'entrada').length,
    saidas: documents.filter((d) => d.invoice_type === 'saida').length,
    uso: items.filter((i) => i.suggested_classification === 'uso_consumo').length,
    revenda: items.filter((i) => i.suggested_classification === 'revenda').length,
    industrializacao: items.filter((i) => i.suggested_classification === 'industrializacao').length,
    revisao: queue.length,
    confianca: items.length ? Math.round((items.reduce((acc, i) => acc + Number(i.confidence_score ?? 0), 0) / items.length) * 100) : 0,
  }), [documents, items, queue]);

  const syncNow = async () => {
    setLoadingSync(true);
    await supabase.functions.invoke('classifica-drive-sync', { body: { trigger: 'manual' } });
    await load();
    setLoadingSync(false);
  };

  return <div className="space-y-5 animate-fade-in">
    <PageHeader title="Classifica" subtitle="Classificação automática de notas fiscais de entrada e saída com aprendizado e auditoria.">
      <Button onClick={syncNow} disabled={loadingSync} className="gap-2"><FolderSync className="h-4 w-4" />{loadingSync ? 'Sincronizando...' : 'Rodar sincronização agora'}</Button>
    </PageHeader>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        ['Notas no mês', stats.total], ['Entradas', stats.entradas], ['Saídas', stats.saidas], ['Uso e consumo', stats.uso],
        ['Revenda', stats.revenda], ['Industrialização', stats.industrializacao], ['Pendentes revisão', stats.revisao], ['Taxa confiança', `${stats.confianca}%`],
      ].map(([k, v]) => <GlassCard key={String(k)} className="p-3 rounded-2xl"><div className="text-xs text-foreground/70">{k}</div><div className="text-2xl font-bold">{String(v)}</div></GlassCard>)}
    </div>

    <Tabs defaultValue="visao-geral" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto">
        {['visao-geral','notas','itens','revisao','regras','logs','drive'].map((tab) => <TabsTrigger key={tab} value={tab}>{tab.replace('-', ' ')}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="visao-geral"><GlassCard className="p-4">Últimos arquivos processados: {documents.slice(0, 5).map((d) => d.drive_file_name).join(', ') || 'Nenhum arquivo processado ainda.'}</GlassCard></TabsContent>
      <TabsContent value="notas"><GlassCard className="p-4 space-y-2">{documents.map((d) => <div key={d.id} className="flex justify-between text-sm"><span>{d.invoice_number} · {d.invoice_type} · {d.status}</span><Badge variant="outline">{d.drive_file_name}</Badge></div>)}</GlassCard></TabsContent>
      <TabsContent value="itens"><GlassCard className="p-4 space-y-2">{items.map((i) => <div key={i.id} className="flex justify-between text-sm"><span>{i.description} ({i.cfop}/{i.ncm})</span><Badge>{i.final_classification ?? i.suggested_classification}</Badge></div>)}</GlassCard></TabsContent>
      <TabsContent value="revisao"><GlassCard className="p-4 space-y-2">{queue.map((q) => <div key={q.id} className="flex items-center justify-between"><span className="text-sm">{q.reason}</span><div className="flex gap-2"><Button size="sm" variant="outline">Corrigir classificação</Button><Button size="sm">Criar regra a partir desta correção</Button></div></div>)}</GlassCard></TabsContent>
      <TabsContent value="regras"><GlassCard className="p-4 space-y-2">{rules.map((r) => <div key={r.id} className="text-sm">{r.rule_name} · prioridade {r.priority}</div>)}</GlassCard></TabsContent>
      <TabsContent value="logs"><GlassCard className="p-4 space-y-2">{logs.map((l) => <div key={l.id} className="text-sm">{new Date(l.created_at).toLocaleString('pt-BR')} · {l.level} · {l.message}</div>)}</GlassCard></TabsContent>
      <TabsContent value="drive"><GlassCard className="p-4 space-y-2"><div className="text-sm">Pasta do Drive integrada reutilizando conexão existente.</div><div className="flex gap-2"><Badge variant="outline">Última sincronização: {logs[0]?.created_at ? new Date(logs[0].created_at).toLocaleString('pt-BR') : 'n/a'}</Badge><Button size="sm" variant="outline" onClick={syncNow}><RefreshCw className="h-3 w-3 mr-1" />Rodar sincronização agora</Button></div><div className="text-xs text-foreground/60">Último erro: {logs.find((l) => l.level === 'error')?.message ?? 'nenhum'}</div></GlassCard></TabsContent>
    </Tabs>
  </div>;
}
