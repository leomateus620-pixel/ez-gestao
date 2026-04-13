import { useState, useMemo } from 'react';
import { mockAlertas, mockEmpresas } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, BellOff, Check, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

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

  const renderAlerta = (alerta: typeof alertas[0]) => {
    const empresa = mockEmpresas.find(e => e.id === alerta.empresaId);
    return (
      <GlassCard key={alerta.id} className={cn('p-4', !alerta.lido && !alerta.resolvido && 'border-l-2 border-l-warning')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className={cn('h-5 w-5 shrink-0 mt-0.5',
              alerta.prioridade === 'critica' ? 'text-destructive' :
              alerta.prioridade === 'alta' ? 'text-warning' : 'text-info'
            )} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{alerta.titulo}</p>
                <StatusBadge status={alerta.prioridade} variant="prioridade" dot={false} className="text-[10px]" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{alerta.descricao}</p>
              <div className="flex gap-3 text-[11px] text-muted-foreground mt-1">
                <span className="cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${alerta.empresaId}`)}>{empresa?.nomeFantasia}</span>
                <span>{formatDate(alerta.criadoEm)}</span>
              </div>
            </div>
          </div>
          {!alerta.resolvido && (
            <div className="flex gap-1 shrink-0">
              {!alerta.lido && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => marcarLido(alerta.id)} title="Marcar como lido">
                  <Bell className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => resolver(alerta.id)} title="Resolver">
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </GlassCard>
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground mt-1">{ativos.length} alertas ativos</p>
      </div>

      <Tabs defaultValue="ativos">
        <TabsList>
          <TabsTrigger value="ativos" className="gap-1.5"><Bell className="h-3.5 w-3.5" />Ativos ({ativos.length})</TabsTrigger>
          <TabsTrigger value="resolvidos" className="gap-1.5"><BellOff className="h-3.5 w-3.5" />Resolvidos ({resolvidos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ativos" className="space-y-2 mt-4">
          {ativos.length === 0 ? (
            <GlassCard className="text-center py-12">
              <Check className="h-10 w-10 mx-auto text-success/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum alerta ativo</p>
            </GlassCard>
          ) : ativos.map(renderAlerta)}
        </TabsContent>

        <TabsContent value="resolvidos" className="space-y-2 mt-4">
          {resolvidos.length === 0 ? (
            <GlassCard className="text-center py-12"><p className="text-sm text-muted-foreground">Nenhum alerta resolvido</p></GlassCard>
          ) : resolvidos.map(renderAlerta)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
