import { MetricCard } from '@/components/MetricCard';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { mockEmpresas, mockCNDItems, mockAlertas, mockEnvios } from '@/data/mockData';
import { formatDate, getCNDTipoLabel } from '@/lib/formatters';
import { getPrioridadeVencimento } from '@/lib/status-utils';
import { AlertTriangle, Clock, FileWarning, Send, Eye, Building2, ArrowRight, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();

  const vencidas = mockCNDItems.filter(c => c.status === 'vencida').length;
  const vencendo = mockCNDItems.filter(c => c.status === 'vencendo').length;
  const pendentes = mockCNDItems.filter(c => c.status === 'pendente').length;
  const enviados = mockEnvios.length;
  const acessosPendentes = mockEnvios.filter(e => e.status === 'enviado').length;
  const empresasCriticas = new Set(
    mockCNDItems.filter(c => c.status === 'vencida').map(c => c.empresaId)
  ).size;

  const statusData = [
    { name: 'Válidas', value: mockCNDItems.filter(c => c.status === 'valida').length, color: 'hsl(142, 71%, 45%)' },
    { name: 'Vencendo', value: vencendo, color: 'hsl(38, 92%, 50%)' },
    { name: 'Vencidas', value: vencidas, color: 'hsl(0, 72%, 51%)' },
    { name: 'Pendentes', value: pendentes, color: 'hsl(199, 89%, 48%)' },
    { name: 'Erro', value: mockCNDItems.filter(c => c.status === 'erro').length, color: 'hsl(0, 62%, 30%)' },
  ];

  const alertasAtivos = mockAlertas
    .filter(a => !a.resolvido)
    .sort((a, b) => {
      const pri = { critica: 0, alta: 1, media: 2, baixa: 3 };
      return (pri[a.prioridade] ?? 4) - (pri[b.prioridade] ?? 4);
    })
    .slice(0, 5);

  const acoesuUrgentes = mockCNDItems
    .filter(c => c.status === 'vencida' || c.status === 'vencendo')
    .sort((a, b) => {
      const pa = getPrioridadeVencimento(a.dataVencimento);
      const pb = getPrioridadeVencimento(b.dataVencimento);
      return pa.urgencia - pb.urgencia;
    })
    .slice(0, 6);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão executiva-operacional do sistema</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Vencidas" value={vencidas} icon={AlertTriangle} color="destructive" onClick={() => navigate('/certidoes')} />
        <MetricCard title="Vencendo" value={vencendo} icon={Clock} color="warning" onClick={() => navigate('/agenda')} />
        <MetricCard title="Pendentes" value={pendentes} icon={FileWarning} color="info" onClick={() => navigate('/certidoes')} />
        <MetricCard title="Enviados" value={enviados} icon={Send} color="primary" onClick={() => navigate('/envios')} />
        <MetricCard title="Sem Acesso" value={acessosPendentes} icon={Eye} color="accent" onClick={() => navigate('/logs')} />
        <MetricCard title="Críticas" value={empresasCriticas} icon={Building2} color="destructive" onClick={() => navigate('/empresas')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-1">
          <h3 className="text-sm font-semibold mb-4">Distribuição de Status</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {statusData.map(s => (
              <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Ações Urgentes</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate('/agenda')} className="text-xs">
              Ver tudo <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="space-y-2">
            {acoesuUrgentes.map(item => {
              const empresa = mockEmpresas.find(e => e.id === item.empresaId);
              const prio = getPrioridadeVencimento(item.dataVencimento);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 hover:bg-card transition-colors cursor-pointer"
                  onClick={() => navigate(`/empresas/${item.empresaId}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('flex h-7 min-w-7 items-center justify-center rounded-md text-[10px] font-bold', prio.color)}>
                      {prio.label.split(' ')[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{empresa?.nomeFantasia}</p>
                      <p className="text-[11px] text-muted-foreground">{getCNDTipoLabel(item.tipo)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    <span className="text-[11px] text-muted-foreground hidden sm:block">{formatDate(item.dataVencimento)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Alertas Ativos
          </h3>
          <Button variant="ghost" size="sm" onClick={() => navigate('/alertas')} className="text-xs">
            Ver todos <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {alertasAtivos.map(alerta => (
            <div
              key={alerta.id}
              className={cn(
                'rounded-lg border px-3 py-2.5 cursor-pointer transition-colors hover:bg-card/80',
                !alerta.lido && 'border-l-2 border-l-warning'
              )}
              onClick={() => navigate(`/empresas/${alerta.empresaId}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium line-clamp-1">{alerta.titulo}</p>
                <StatusBadge status={alerta.prioridade} variant="prioridade" dot={false} className="text-[10px] shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{alerta.descricao}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
