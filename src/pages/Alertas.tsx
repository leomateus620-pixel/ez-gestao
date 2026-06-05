import { useState, useMemo } from 'react';
import { useDataStore } from '@/data/DataProvider';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useConfirmAction } from '@/hooks/useConfirmAction';
import { Bell, BellOff, Check, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Alerta } from '@/data/types';

export default function Alertas() {
  const navigate = useNavigate();
  const { state, resolveAlerta, markAlertaLido, resolveAllAlertas, markAllAlertasLidos } = useDataStore();
  const confirmAction = useConfirmAction();

  const ativos = useMemo(() => state.alertas.filter(a => !a.resolvido).sort((a, b) => {
    const pri: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
    return (pri[a.prioridade] ?? 4) - (pri[b.prioridade] ?? 4);
  }), [state.alertas]);

  const resolvidos = useMemo(() => state.alertas.filter(a => a.resolvido), [state.alertas]);

  const handleResolver = (id: string) => {
    resolveAlerta(id);
    toast.success('Alerta resolvido');
  };

  const handleMarcarLido = (id: string) => {
    markAlertaLido(id);
    toast.info('Marcado como lido');
  };

  const handleResolverTodos = () => {
    confirmAction.requestConfirm(
      'Resolver todos os alertas',
      `Tem certeza que deseja resolver ${ativos.length} alertas ativos? Esta ação não pode ser desfeita.`,
      () => { resolveAllAlertas(); toast.success(`${ativos.length} alertas resolvidos`); }
    );
  };

  const handleMarcarTodosLidos = () => {
    markAllAlertasLidos();
    toast.info('Todos marcados como lidos');
  };

  const grouped: Record<string, Alerta[]> = { critica: [], alta: [], media: [], baixa: [] };
  ativos.forEach(a => { if (grouped[a.prioridade]) grouped[a.prioridade].push(a); });

  const prioLabels: Record<string, string> = { critica: 'Críticas', alta: 'Alta Prioridade', media: 'Média Prioridade', baixa: 'Baixa Prioridade' };
  const prioColors: Record<string, string> = { critica: 'text-destructive', alta: 'text-warning', media: 'text-info', baixa: 'text-foreground/68' };

  const renderAlerta = (alerta: Alerta) => {
    const empresa = state.empresas.find(e => e.id === alerta.empresaId);
    return (
      <div key={alerta.id} className={cn('glass-card-subtle p-4 transition-all hover:shadow-sm', !alerta.lido && !alerta.resolvido && 'border-l-3 border-l-warning', alerta.resolvido && 'opacity-60')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5', alerta.prioridade === 'critica' ? 'text-destructive' : alerta.prioridade === 'alta' ? 'text-warning' : 'text-info')} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={cn('text-sm font-medium', alerta.resolvido && 'line-through')}>{alerta.titulo}</p>
                <StatusBadge status={alerta.prioridade} variant="prioridade" dot={false} className="text-[10px]" />
              </div>
              <p className="text-[11px] text-foreground/72 mt-0.5">{alerta.descricao}</p>
              <div className="flex gap-3 text-[11px] text-foreground/70 mt-1.5">
                <span className="cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${alerta.empresaId}`)}>{empresa?.nomeFantasia}</span>
                <span>{formatDate(alerta.criadoEm)}</span>
              </div>
            </div>
          </div>
          {!alerta.resolvido && (
            <div className="flex gap-1 shrink-0">
              {!alerta.lido && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarcarLido(alerta.id)} title="Marcar como lido">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResolver(alerta.id)} title="Resolver">
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Alertas" subtitle={`${ativos.length} alertas ativos`} />

      <Tabs defaultValue="ativos">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="bg-muted/30 p-1">
            <TabsTrigger value="ativos" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Bell className="h-3.5 w-3.5" />Ativos ({ativos.length})
            </TabsTrigger>
            <TabsTrigger value="resolvidos" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <BellOff className="h-3.5 w-3.5" />Resolvidos ({resolvidos.length})
            </TabsTrigger>
          </TabsList>
          {ativos.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleMarcarTodosLidos}>Marcar todos como lidos</Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleResolverTodos}>Resolver todos</Button>
            </div>
          )}
        </div>

        <TabsContent value="ativos" className="space-y-6 mt-4">
          {ativos.length === 0 ? (
            <EmptyState icon={CheckCircle} title="Nenhum alerta ativo" description="Todos os alertas foram resolvidos." />
          ) : (
            Object.entries(grouped).filter(([, items]) => items.length > 0).map(([prio, items]) => (
              <div key={prio}>
                <h3 className={cn('text-xs font-semibold uppercase tracking-wider mb-2 px-1', prioColors[prio])}>
                  {prioLabels[prio]} ({items.length})
                </h3>
                <div className="space-y-1.5">{items.map(renderAlerta)}</div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="resolvidos" className="space-y-1.5 mt-4">
          {resolvidos.length === 0 ? (
            <EmptyState icon={BellOff} title="Nenhum alerta resolvido" />
          ) : resolvidos.map(renderAlerta)}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        isOpen={confirmAction.isOpen}
        title={confirmAction.title}
        description={confirmAction.description}
        onConfirm={confirmAction.confirm}
        onCancel={confirmAction.cancel}
        confirmLabel="Resolver todos"
        variant="destructive"
      />
    </div>
  );
}
