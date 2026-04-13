import { useState, useMemo } from 'react';
import { mockAlertas, mockEmpresas } from '@/data/mockData';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { SectionHeader } from '@/components/SectionHeader';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, BellOff, Check, AlertTriangle, CheckCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { Alerta } from '@/data/types';

export default function Alertas() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState(mockAlertas);

  const ativos = useMemo(() => alertas.filter(a => !a.resolvido).sort((a, b) => {
    const pri = { critica: 0, alta: 1, media: 2, baixa: 3 };
    return (pri[a.prioridade] ?? 4) - (pri[b.prioridade] ?? 4);
  }), [alertas]);

  const resolvidos = useMemo(() => alertas.filter(a => a.resolvido), [alertas]);

  const marcarLido = (id: string) => setAlertas(prev => prev.map(a => a.id === id ? { ...a, lido: true } : a));
  const resolver = (id: string) => setAlertas(prev => prev.map(a => a.id === id ? { ...a, resolvido: true } : a));
  const marcarTodosLidos = () => setAlertas(prev => prev.map(a => ({ ...a, lido: true })));
  const resolverTodos = () => setAlertas(prev => prev.map(a => a.resolvido ? a : { ...a, resolvido: true }));

  // Group by priority
  const grouped: Record<string, Alerta[]> = { critica: [], alta: [], media: [], baixa: [] };
  ativos.forEach(a => {
    if (grouped[a.prioridade]) grouped[a.prioridade].push(a);
  });

  const prioLabels: Record<string, string> = { critica: 'Críticas', alta: 'Alta Prioridade', media: 'Média Prioridade', baixa: 'Baixa Prioridade' };
  const prioColors: Record<string, string> = { critica: 'text-destructive', alta: 'text-warning', media: 'text-info', baixa: 'text-muted-foreground' };

  const renderAlerta = (alerta: Alerta) => {
    const empresa = mockEmpresas.find(e => e.id === alerta.empresaId);
    return (
      <div key={alerta.id} className={cn(
        'glass-card-subtle p-4 transition-all hover:shadow-sm',
        !alerta.lido && !alerta.resolvido && 'border-l-3 border-l-warning',
        alerta.resolvido && 'opacity-60'
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5',
              alerta.prioridade === 'critica' ? 'text-destructive' :
              alerta.prioridade === 'alta' ? 'text-warning' : 'text-info'
            )} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={cn('text-sm font-medium', alerta.resolvido && 'line-through')}>{alerta.titulo}</p>
                <StatusBadge status={alerta.prioridade} variant="prioridade" dot={false} className="text-[10px]" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{alerta.descricao}</p>
              <div className="flex gap-3 text-[11px] text-muted-foreground mt-1.5">
                <span className="cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${alerta.empresaId}`)}>{empresa?.nomeFantasia}</span>
                <span>{formatDate(alerta.criadoEm)}</span>
              </div>
            </div>
          </div>
          {!alerta.resolvido && (
            <div className="flex gap-1 shrink-0">
              {!alerta.lido && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => marcarLido(alerta.id)} title="Marcar como lido">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => resolver(alerta.id)} title="Resolver">
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
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={marcarTodosLidos}>Marcar todos como lidos</Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={resolverTodos}>Resolver todos</Button>
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
                <div className="space-y-1.5">
                  {items.map(renderAlerta)}
                </div>
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
    </div>
  );
}
