import { MetricCard } from '@/components/MetricCard';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { HealthBar } from '@/components/HealthBar';
import { SectionHeader } from '@/components/SectionHeader';
import { PageHeader } from '@/components/PageHeader';
import { mockEmpresas, mockCNDItems, mockAlertas, mockEnvios, mockLogs } from '@/data/mockData';
import { formatDate, formatDateTime, getCNDTipoLabel } from '@/lib/formatters';
import { getPrioridadeVencimento } from '@/lib/status-utils';
import { AlertTriangle, Clock, FileWarning, Send, Eye, Building2, ArrowRight, ShieldAlert, Upload, CalendarDays, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();

  const vencidas = mockCNDItems.filter(c => c.status === 'vencida').length;
  const vencendo = mockCNDItems.filter(c => c.status === 'vencendo').length;
  const pendentes = mockCNDItems.filter(c => c.status === 'pendente').length;
  const validas = mockCNDItems.filter(c => c.status === 'valida').length;
  const enviados = mockEnvios.length;
  const acessosPendentes = mockEnvios.filter(e => e.status === 'enviado').length;
  const empresasCriticas = new Set(
    mockCNDItems.filter(c => c.status === 'vencida').map(c => c.empresaId)
  ).size;

  const totalCNDs = mockCNDItems.length;

  const statusData = [
    { name: 'Válidas', value: validas, color: 'hsl(142, 71%, 45%)' },
    { name: 'Vencendo', value: vencendo, color: 'hsl(38, 92%, 50%)' },
    { name: 'Vencidas', value: vencidas, color: 'hsl(0, 72%, 51%)' },
    { name: 'Pendentes', value: pendentes, color: 'hsl(199, 89%, 48%)' },
    { name: 'Erro', value: mockCNDItems.filter(c => c.status === 'erro').length, color: 'hsl(0, 40%, 40%)' },
  ];

  const alertasAtivos = mockAlertas
    .filter(a => !a.resolvido)
    .sort((a, b) => {
      const pri = { critica: 0, alta: 1, media: 2, baixa: 3 };
      return (pri[a.prioridade] ?? 4) - (pri[b.prioridade] ?? 4);
    })
    .slice(0, 5);

  const acoesUrgentes = mockCNDItems
    .filter(c => c.status === 'vencida' || c.status === 'vencendo')
    .sort((a, b) => {
      const pa = getPrioridadeVencimento(a.dataVencimento);
      const pb = getPrioridadeVencimento(b.dataVencimento);
      return pa.urgencia - pb.urgencia;
    })
    .slice(0, 5);

  // At-risk companies
  const empresasRisco = mockEmpresas
    .filter(e => e.status === 'ativa')
    .map(e => {
      const cnds = mockCNDItems.filter(c => c.empresaId === e.id);
      const v = cnds.filter(c => c.status === 'vencida').length;
      const vn = cnds.filter(c => c.status === 'vencendo').length;
      const vl = cnds.filter(c => c.status === 'valida').length;
      const p = cnds.filter(c => c.status === 'pendente' || c.status === 'erro').length;
      const score = v * 3 + vn * 2 + p;
      const pctValid = cnds.length > 0 ? Math.round((vl / cnds.length) * 100) : 100;
      return { ...e, vencidas: v, vencendo: vn, validas: vl, pendentes: p, total: cnds.length, score, pctValid };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  // Recent logs
  const recentLogs = [...mockLogs]
    .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Dashboard" subtitle="Visão executiva-operacional do sistema" />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard title="Vencidas" value={vencidas} icon={AlertTriangle} color="destructive" onClick={() => navigate('/certidoes')} />
        <MetricCard title="Vencendo" value={vencendo} icon={Clock} color="warning" onClick={() => navigate('/agenda')} />
        <MetricCard title="Pendentes" value={pendentes} icon={FileWarning} color="info" onClick={() => navigate('/certidoes')} />
        <MetricCard title="Enviados" value={enviados} icon={Send} color="primary" onClick={() => navigate('/envios')} />
        <MetricCard title="Sem Acesso" value={acessosPendentes} icon={Eye} color="accent" onClick={() => navigate('/logs')} />
        <MetricCard title="Críticas" value={empresasCriticas} icon={Building2} color="destructive" onClick={() => navigate('/empresas')} />
      </div>

      {/* Quick Actions */}
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

      {/* Chart + Urgent Actions */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard variant="elevated" className="lg:col-span-1">
          <SectionHeader title="Distribuição de Status" />
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
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
                    boxShadow: '0 4px 12px hsla(var(--glass-shadow))',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <span className="text-2xl font-bold">{totalCNDs}</span>
                <span className="block text-[10px] text-muted-foreground">Total</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
            {statusData.filter(s => s.value > 0).map(s => (
              <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
              const empresa = mockEmpresas.find(e => e.id === item.empresaId);
              const prio = getPrioridadeVencimento(item.dataVencimento);
              return (
                <div
                  key={item.id}
                  className="data-row"
                  onClick={() => navigate(`/empresas/${item.empresaId}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      'flex h-7 min-w-16 items-center justify-center rounded-md text-[10px] font-bold shrink-0',
                      prio.color
                    )}>
                      {prio.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{empresa?.nomeFantasia}</p>
                      <p className="text-[11px] text-muted-foreground">{getCNDTipoLabel(item.tipo)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={item.status} />
                    <span className="text-[11px] text-muted-foreground hidden sm:block">{formatDate(item.dataVencimento)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* At-Risk Companies + Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <SectionHeader title="Empresas em Risco" icon={AlertTriangle}>
            <Button variant="ghost" size="sm" onClick={() => navigate('/empresas')} className="text-xs h-7">
              Ver todas <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </SectionHeader>
          <div className="space-y-3">
            {empresasRisco.map(e => (
              <div
                key={e.id}
                className="data-row"
                onClick={() => navigate(`/empresas/${e.id}`)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-xs font-bold">
                    {e.nomeFantasia.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{e.nomeFantasia}</p>
                    <HealthBar
                      validas={e.validas}
                      vencendo={e.vencendo}
                      vencidas={e.vencidas}
                      pendentes={e.pendentes}
                      total={e.total}
                      className="mt-1.5 max-w-48"
                    />
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span className="text-lg font-bold text-destructive">{e.vencidas}</span>
                  <span className="text-[10px] text-muted-foreground block">vencidas</span>
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
              const empresa = mockEmpresas.find(e => e.id === log.empresaId);
              return (
                <div key={log.id} className="relative pl-5">
                  <div className={cn(
                    'absolute -left-[5px] top-1.5 h-2 w-2 rounded-full',
                    log.acao === 'envio' ? 'bg-primary' :
                    log.acao === 'download' ? 'bg-success' : 'bg-info'
                  )} />
                  <p className="text-xs font-medium leading-snug">{log.detalhes}</p>
                  <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>{empresa?.nomeFantasia}</span>
                    <span>•</span>
                    <span>{formatDateTime(log.dataHora)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* Alerts */}
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
              <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">{alerta.descricao}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
