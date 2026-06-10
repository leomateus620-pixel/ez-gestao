/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, ClipboardCheck, FileText, FolderSync, Gauge, PackageCheck, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Classifica() {
  const db = supabase as any;
  const [documents, setDocuments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);

  const load = async () => {
    setLoadingData(true);
    const queries = [
      { label: 'notas fiscais', run: () => db.from('classifica_documents').select('*').order('created_at', { ascending: false }).limit(20), apply: setDocuments },
      { label: 'itens das notas', run: () => db.from('classifica_invoice_items').select('*').order('created_at', { ascending: false }).limit(50), apply: setItems },
      { label: 'regras de classificação', run: () => db.from('classifica_rules').select('*').order('created_at', { ascending: false }).limit(30), apply: setRules },
      { label: 'fila de revisão', run: () => db.from('classifica_review_queue').select('*').order('created_at', { ascending: false }).limit(30), apply: setQueue },
      { label: 'logs de processamento', run: () => db.from('classifica_processing_logs').select('*').order('created_at', { ascending: false }).limit(20), apply: setLogs },
    ];

    const results = await Promise.allSettled(queries.map((query) => query.run()));
    const errors: string[] = [];

    results.forEach((result, index) => {
      const query = queries[index];
      if (result.status === 'rejected') {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason ?? 'erro desconhecido');
        console.error('[classifica] falha ao carregar dados', { dataset: query.label, error: result.reason });
        errors.push(`${query.label}: ${message}`);
        return;
      }

      if (result.value.error) {
        console.error('[classifica] falha ao consultar tabela', { dataset: query.label, error: result.value.error });
        errors.push(`${query.label}: ${result.value.error.message ?? 'sem permissão ou tabela ausente'}`);
        return;
      }

      query.apply(result.value.data ?? []);
    });

    setLoadErrors(errors);
    if (errors.length) {
      toast.warning('Alguns dados não foram carregados', { description: 'A tela seguirá com os dados parciais disponíveis.' });
    }
    setLoadingData(false);
  };

  // load is intentionally stable enough for the initial screen hydration; manual retries call the latest function.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      const { error } = await supabase.functions.invoke('classifica-drive-sync', { body: { trigger: 'manual' } });
      if (error) throw error;
      await load();
      toast.success('Sincronização concluída');
    } catch (error) {
      toast.error('Sincronização indisponível', {
        description: error instanceof Error ? error.message : 'Verifique a função classifica-drive-sync.',
      });
    } finally {
      setLoadingSync(false);
    }
  };
  const notifyReviewAction = (action: string) => {
    toast.info(action, { description: 'A edição assistida da fila de revisão ainda não foi publicada para este módulo.' });
  };

  const statCards = [
    ['Notas no mês', stats.total, 'Documentos capturados', FileText, 'var(--menu-blue)'],
    ['Entradas', stats.entradas, 'Notas de entrada', ClipboardCheck, 'var(--menu-emerald)'],
    ['Saídas', stats.saidas, 'Notas de saída', PackageCheck, 'var(--menu-cyan)'],
    ['Taxa confiança', `${stats.confianca}%`, 'Média do classificador', Gauge, 'var(--menu-violet)'],
    ['Uso e consumo', stats.uso, 'Sugestões do robô', Sparkles, 'var(--menu-amber)'],
    ['Revenda', stats.revenda, 'Itens categorizados', PackageCheck, 'var(--menu-rose)'],
    ['Industrialização', stats.industrializacao, 'Fluxo produtivo', ClipboardCheck, 'var(--menu-cyan)'],
    ['Pendentes revisão', stats.revisao, 'Ajustes humanos', Gauge, 'var(--menu-amber)'],
  ] as const;

  return <div className="space-y-5">
    <PageHeader title="Classifica" subtitle="Classificação automática de notas fiscais com leitura visual, confiança destacada e revisão guiada.">
      {loadingData && <Badge variant="outline">Carregando dados...</Badge>}
      <Button onClick={syncNow} disabled={loadingSync} className="gap-2"><FolderSync className="h-4 w-4" />{loadingSync ? 'Sincronizando...' : 'Rodar sincronização agora'}</Button>
    </PageHeader>


    {loadErrors.length > 0 && (
      <GlassCard className="border-amber-200 bg-amber-50/80 text-amber-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />Alguns dados não foram carregados</div>
            <p className="mt-1 text-sm">A página continua disponível com dados parciais. Verifique permissões/tabelas do Supabase para os itens abaixo.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{loadErrors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button>
        </div>
      </GlassCard>
    )}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {statCards.map(([label, value, caption, Icon, color]) => (
        <div key={label} className="liquid-stat-card" style={{ '--stat-color': color } as CSSProperties}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/66">{label}</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{String(value)}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/55 p-2 text-primary shadow-inner backdrop-blur-xl"><Icon className="h-4 w-4" /></div>
          </div>
          <p className="mt-1 text-xs font-medium text-foreground/70">{caption}</p>
        </div>
      ))}
    </div>

    <Tabs defaultValue="visao-geral" className="space-y-4">
      <TabsList className="glass-card flex h-auto flex-wrap justify-center gap-1 p-1.5">
        {['visao-geral','notas','itens','revisao','regras','logs','drive'].map((tab) => <TabsTrigger className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white" key={tab} value={tab}>{tab.replace('-', ' ')}</TabsTrigger>)}
      </TabsList>
      <TabsContent value="visao-geral"><GlassCard className="p-4">Últimos arquivos processados: <span className="font-semibold text-foreground">{documents.slice(0, 5).map((d) => d.drive_file_name).join(', ') || 'Nenhum arquivo processado ainda.'}</span></GlassCard></TabsContent>
      <TabsContent value="notas"><GlassCard className="p-4 space-y-2">{documents.length === 0 && <p className="text-sm text-foreground/60">Nenhuma nota carregada.</p>}{documents.map((d) => <div key={d.id} className="flex justify-between rounded-xl border border-white/50 bg-white/45 p-3 text-sm"><span>{d.invoice_number} · {d.invoice_type} · {d.status}</span><Badge variant="outline">{d.drive_file_name}</Badge></div>)}</GlassCard></TabsContent>
      <TabsContent value="itens"><GlassCard className="p-4 space-y-2">{items.length === 0 && <p className="text-sm text-foreground/60">Nenhum item carregado.</p>}{items.map((i) => <div key={i.id} className="flex justify-between rounded-xl border border-white/50 bg-white/45 p-3 text-sm"><span>{i.description} ({i.cfop}/{i.ncm})</span><Badge>{i.final_classification ?? i.suggested_classification}</Badge></div>)}</GlassCard></TabsContent>
      <TabsContent value="revisao"><GlassCard className="p-4 space-y-2">{queue.map((q) => <div key={q.id} className="flex items-center justify-between rounded-xl border border-amber-200/70 bg-amber-50/45 p-3"><span className="text-sm font-medium">{q.reason}</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => notifyReviewAction('Corrigir classificação')}>Corrigir classificação</Button><Button size="sm" onClick={() => notifyReviewAction('Criar regra')}>Criar regra</Button></div></div>)}</GlassCard></TabsContent>
      <TabsContent value="regras"><GlassCard className="p-4 space-y-2">{rules.map((r) => <div key={r.id} className="rounded-xl border border-white/50 bg-white/45 p-3 text-sm">{r.rule_name} · prioridade {r.priority}</div>)}</GlassCard></TabsContent>
      <TabsContent value="logs"><GlassCard className="p-4 space-y-2">{logs.map((l) => <div key={l.id} className="rounded-xl border border-white/50 bg-white/45 p-3 text-sm">{new Date(l.created_at).toLocaleString('pt-BR')} · {l.level} · {l.message}</div>)}</GlassCard></TabsContent>
      <TabsContent value="drive"><GlassCard className="p-4 space-y-2"><div className="text-sm font-medium">Pasta do Drive integrada reutilizando conexão existente.</div><div className="flex gap-2"><Badge variant="outline">Última sincronização: {logs[0]?.created_at ? new Date(logs[0].created_at).toLocaleString('pt-BR') : 'n/a'}</Badge><Button size="sm" variant="outline" onClick={syncNow} disabled={loadingSync}><RefreshCw className="h-3 w-3 mr-1" />Rodar sincronização agora</Button></div><div className="text-xs text-foreground/72">Último erro: {logs.find((l) => l.level === 'error')?.message ?? 'nenhum'}</div></GlassCard></TabsContent>
    </Tabs>
  </div>;
}
