import { useMemo, useState } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { PageHeader } from '@/components/PageHeader';
import { ExceptionCard } from '@/components/ExceptionCard';
import { ReviewPanel } from '@/components/ReviewPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { tipologiaLabels, type ExceptionItem, type ExceptionTipologia } from '@/data/automation-types';

export default function Excecoes() {
  const { state, resolveException, requeueException, discardException, assignException } = useAutomation();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>('ativas');
  const [criticidadeFilter, setCriticidadeFilter] = useState<string>('todas');
  const [tipologiaFilter, setTipologiaFilter] = useState<string>('todas');
  const [reviewTarget, setReviewTarget] = useState<ExceptionItem | null>(null);

  const filtered = useMemo(() => {
    let exc = [...state.exceptions].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
    if (statusFilter === 'ativas') exc = exc.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise');
    else if (statusFilter !== 'todas') exc = exc.filter(e => e.statusExcecao === statusFilter);
    if (criticidadeFilter !== 'todas') exc = exc.filter(e => e.criticidade === criticidadeFilter);
    if (tipologiaFilter !== 'todas') exc = exc.filter(e => e.tipologia === tipologiaFilter);
    return exc;
  }, [state.exceptions, statusFilter, criticidadeFilter, tipologiaFilter]);

  const countByCriticidade = useMemo(() => {
    const active = state.exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise');
    return {
      critica: active.filter(e => e.criticidade === 'critica').length,
      alta: active.filter(e => e.criticidade === 'alta').length,
      media: active.filter(e => e.criticidade === 'media').length,
      baixa: active.filter(e => e.criticidade === 'baixa').length,
    };
  }, [state.exceptions]);

  const pendingCount = state.exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise').length;

  const activeTipologias = useMemo(() => {
    const active = state.exceptions.filter(e => e.statusExcecao === 'pendente' || e.statusExcecao === 'em_analise');
    const types = new Set(active.map(e => e.tipologia));
    return Array.from(types);
  }, [state.exceptions]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Fila de Exceções"
        subtitle={`${pendingCount} exceções pendentes de ${state.exceptions.length} total`}
      />

      {/* Criticidade pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'critica', label: 'Críticas', count: countByCriticidade.critica, color: 'bg-destructive/10 text-destructive border-destructive/20' },
          { key: 'alta', label: 'Altas', count: countByCriticidade.alta, color: 'bg-warning/10 text-warning border-warning/20' },
          { key: 'media', label: 'Médias', count: countByCriticidade.media, color: 'bg-info/10 text-info border-info/20' },
          { key: 'baixa', label: 'Baixas', count: countByCriticidade.baixa, color: 'bg-muted text-foreground/60 border-border' },
        ].map(pill => (
          <button
            key={pill.key}
            onClick={() => setCriticidadeFilter(criticidadeFilter === pill.key ? 'todas' : pill.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              criticidadeFilter === pill.key ? 'ring-2 ring-primary/30 scale-105' : ''
            } ${pill.color}`}
          >
            {pill.label} ({pill.count})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativas">Ativas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em_analise">Em Análise</SelectItem>
            <SelectItem value="resolvida">Resolvidas</SelectItem>
            <SelectItem value="descartada">Descartadas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipologiaFilter} onValueChange={setTipologiaFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Tipologia" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas Tipologias</SelectItem>
            {activeTipologias.map(t => (
              <SelectItem key={t} value={t}>{tipologiaLabels[t as ExceptionTipologia]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-foreground/20 mx-auto mb-3" />
          <p className="text-foreground/50 text-sm">Nenhuma exceção encontrada</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(exc => (
            <ExceptionCard
              key={exc.id}
              exception={exc}
              onResolve={() => {
                resolveException(exc.id, 'admin');
                toast({ title: 'Exceção resolvida' });
              }}
              onRequeue={() => {
                requeueException(exc.id);
                toast({ title: 'Exceção reenfileirada' });
              }}
              onDiscard={() => {
                discardException(exc.id);
                toast({ title: 'Exceção descartada' });
              }}
              onAssign={() => {
                assignException(exc.id, 'Ana Silva');
                toast({ title: 'Exceção escalada para Ana Silva' });
              }}
              onClick={() => setReviewTarget(exc)}
            />
          ))}
        </div>
      )}

      <ReviewPanel
        exception={reviewTarget}
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        onPublish={(excId) => {
          resolveException(excId, 'admin (revisão)');
          setReviewTarget(null);
          toast({ title: 'Resultado revisado publicado' });
        }}
      />
    </div>
  );
}
