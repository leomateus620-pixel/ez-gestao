import { useMemo, useState, useEffect } from 'react';
import { MetricCard } from '@/components/MetricCard';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { HealthBar } from '@/components/HealthBar';
import { SectionHeader } from '@/components/SectionHeader';
import { PageHeader } from '@/components/PageHeader';
import { MetricCardSkeleton, ListRowSkeleton } from '@/components/LoadingSkeleton';
import { useDataStore } from '@/data/DataProvider';
import { formatDate, formatDateTime, getCNDTipoLabel } from '@/lib/formatters';
import { getPrioridadeVencimento, consolidarDashboard, calcularResumoEmpresa } from '@/lib/status-utils';
import { AlertTriangle, Clock, FileWarning, Send, Eye, Building2, ArrowRight, ShieldAlert, Upload, CalendarDays, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();
  const { state } = useDataStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(t);
  }, []);

  const metrics = useMemo(() =>
    consolidarDashboard(state.empresas, state.cnds, state.documentos, state.envios, state.logs),
    [state.empresas, state.cnds, state.documentos, state.envios, state.logs]
  );

  const statusData = useMemo(() => [
    { name: 'Válidas', value: metrics.validas, color: 'hsl(142, 71%, 45%)' },
    { name: 'Vencendo', value: metrics.vencendo, color: 'hsl(38, 92%, 50%)' },
    { name: 'Vencidas', value: metrics.vencidas, color: 'hsl(0, 72%, 51%)' },
    { name: 'Pendentes', value: metrics.pendentes, color: 'hsl(199, 89%, 48%)' },
    { name: 'Erro', value: metrics.erros, color: 'hsl(0, 40%, 40%)' },
  ], [metrics]);

  const alertasAtivos = useMemo(() =>
    state.alertas
      .filter(a => !a.resolvido)
      .sort((a, b) => {
        const pri: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
        return (pri[a.prioridade] ?? 4) - (pri[b.prioridade] ?? 4);
      })
      .slice(0, 5),
    [state.alertas]
  );

  const acoesUrgentes = useMemo(() =>
    state.cnds
      .filter(c => c.status === 'vencida' || c.status === 'vencendo')
      .sort((a, b) => getPrioridadeVencimento(a.dataVencimento).urgencia - getPrioridadeVencimento(b.dataVencimento).urgencia)
      .slice(0, 5),
    [state.cnds]
  );

  const empresasRisco = useMemo(() =>
    state.empresas
      .filter(e => e.status === 'ativa')
      .map(e => ({ ...e, resumo: calcularResumoEmpresa(e.id, state.cnds) }))
      .filter(e => e.resumo.score > 0)
      .sort((a, b) => b.resumo.score - a.resumo.score)
      .slice(0, 4),
    [state.empresas, state.cnds]
  );

  const recentLogs = useMemo(() =>
    [...state.logs].sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()).slice(0, 5),
    [state.logs]
  );

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Dashboard" subtitle="Visão executiva-operacional do sistema" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <ListRowSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Dashboard" subtitle="Visão executiva-operacional do sistema" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Vencidas" value={metrics.vencidas} icon={AlertTriangle} color="destructive" onClick={() => navigate('/certidoes')} />
        <MetricCard title="Vencendo" value={metrics.vencendo} icon={Clock} color="warning" onClick={() => navigate('/agenda')} />
        <MetricCard title="Pendentes" value={metrics.pendentes} icon={FileWarning} color="info" onClick={() => navigate('/certidoes')} />
        <MetricCard title="Enviados" value={metrics.enviados} icon={Send} color="primary" onClick={() => navigate('/envios')} />
        <MetricCard title="Sem Acesso" value={metrics.acessosPendentes} icon={Eye} color="accent" onClick={() => navigate('/logs')} />
        <MetricCard title="Críticas" value={metrics.empresasCriticas} icon={Building2} color="destructive" onClick={() => navigate('/empresas')} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-2 text-xs h-8" onClick={() => navigate('/documentos')}>
          <Upload className="h-3.5 w-3.5" /> Novo Upload
        </Button>
        <Button variant="outline" size="sm" className="gap-2 text-xs h-8" onClick={() => navigate('/envios')}>
          <Send className="h-3.5 w-3.5" /> Enviar Documentos
        </Button>
        <Button variant="outline" size="sm" className="gap-2 text-xs h-8" onClick={() => navigate('/agenda')}>
          <CalendarDays className="h-3.5 w-3.5" /> Ver Agenda
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard variant="elevated" className="lg:col-span-1">
          <SectionHeader title="Distribuição de Status" />
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 12px hsla(var(--glass-shadow))' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <span className="text-2xl font-bold">{metrics.totalCNDs}</span>
                <span className="block text-[10px] text-foreground/50">Total</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
            {statusData.filter(s => s.value > 0).map(s => (
              <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-foreground/65">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="lg:col-span-2">
          <SectionHeader title="Ações Urgentes">
            <Button variant="ghost" size="sm" onClick={() => navigate('/agenda')} className="text-xs h-7">
              Ver tudo <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </SectionHeader>
          <div className="space-y-1.5">
            {acoesUrgentes.map(item => {
              const empresa = state.empresas.find(e => e.id === item.empresaId);
              const prio = getPrioridadeVencimento(item.dataVencimento);
              return (
                <div key={item.id} className="data-row" onClick={() => navigate(`/empresas/${item.empresaId}`)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('flex h-7 min-w-16 items-center justify-center rounded-md text-[10px] font-bold shrink-0', prio.color)}>
                      {prio.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{empresa?.nomeFantasia}</p>
                      <p className="text-[11px] text-foreground/60">{getCNDTipoLabel(item.tipo)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={item.status} />
                    <span className="text-[11px] text-foreground/60 hidden sm:block">{formatDate(item.dataVencimento)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <SectionHeader title="Empresas em Risco" icon={AlertTriangle}>
            <Button variant="ghost" size="sm" onClick={() => navigate('/empresas')} className="text-xs h-7">
              Ver todas <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </SectionHeader>
          <div className="space-y-3">
            {empresasRisco.map(e => (
              <div key={e.id} className="data-row" onClick={() => navigate(`/empresas/${e.id}`)}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-xs font-bold">
                    {e.nomeFantasia.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.nomeFantasia}</p>
                    <HealthBar validas={e.resumo.validas} vencendo={e.resumo.vencendo} vencidas={e.resumo.vencidas} pendentes={e.resumo.pendentes} total={e.resumo.total} className="mt-1.5 max-w-48" />
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span className="text-lg font-bold text-destructive">{e.resumo.vencidas}</span>
                  <span className="text-[10px] text-foreground/50 block">vencidas</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <SectionHeader title="Atividade Recente" icon={Activity}>
            <Button variant="ghost" size="sm" onClick={() => navigate('/logs')} className="text-xs h-7">
              Ver tudo <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </SectionHeader>
          <div className="relative border-l-2 border-border/60 ml-3 space-y-3 py-1">
            {recentLogs.map(log => {
              const empresa = state.empresas.find(e => e.id === log.empresaId);
              return (
                <div key={log.id} className="relative pl-5">
                  <div className={cn('absolute -left-[5px] top-1.5 h-2 w-2 rounded-full',
                    log.acao === 'envio' ? 'bg-primary' : log.acao === 'download' ? 'bg-success' : 'bg-info'
                  )} />
                  <p className="text-xs font-medium leading-snug">{log.detalhes}</p>
                  <div className="flex gap-2 text-[10px] text-foreground/55 mt-0.5">
                    <span>{empresa?.nomeFantasia}</span>
                    <span className="text-foreground/30">•</span>
                    <span>{formatDateTime(log.dataHora)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <SectionHeader title="Alertas Ativos" icon={ShieldAlert}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/alertas')} className="text-xs h-7">
            Ver todos <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </SectionHeader>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {alertasAtivos.map(alerta => (
            <div
              key={alerta.id}
              className={cn(
                'rounded-lg border px-3.5 py-3 cursor-pointer transition-all duration-200 hover:bg-card/80 hover:shadow-sm',
                !alerta.lido && 'border-l-3 border-l-warning'
              )}
              onClick={() => navigate(`/empresas/${alerta.empresaId}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium line-clamp-1">{alerta.titulo}</p>
                <StatusBadge status={alerta.prioridade} variant="prioridade" dot={false} className="text-[10px] shrink-0" />
              </div>
              <p className="text-[11px] text-foreground/60 mt-1.5 line-clamp-1">{alerta.descricao}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
