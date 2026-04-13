import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockCNDItems, mockEmpresas } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, getCNDTipoLabel } from '@/lib/formatters';
import { getPrioridadeVencimento } from '@/lib/status-utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { CalendarDays, List, Clock, ArrowRight } from 'lucide-react';
import { parseISO, differenceInDays, isToday } from 'date-fns';

function groupByUrgency(items: typeof mockCNDItems) {
  const groups: Record<string, typeof mockCNDItems> = {
    'Vencidos': [],
    'Vence Hoje': [],
    'Próximos 3 dias': [],
    'Próximos 7 dias': [],
    'Válidos': [],
  };
  items.forEach(item => {
    if (!item.dataVencimento) return;
    const days = differenceInDays(parseISO(item.dataVencimento), new Date());
    if (days < 0) groups['Vencidos'].push(item);
    else if (isToday(parseISO(item.dataVencimento))) groups['Vence Hoje'].push(item);
    else if (days <= 3) groups['Próximos 3 dias'].push(item);
    else if (days <= 7) groups['Próximos 7 dias'].push(item);
    else groups['Válidos'].push(item);
  });
  return groups;
}

export default function Agenda() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const itensComVencimento = useMemo(() =>
    mockCNDItems
      .filter(c => c.dataVencimento && c.status !== 'nao_aplicavel')
      .sort((a, b) => {
        const pa = getPrioridadeVencimento(a.dataVencimento);
        const pb = getPrioridadeVencimento(b.dataVencimento);
        return pa.urgencia - pb.urgencia;
      }),
  []);

  const grouped = useMemo(() => groupByUrgency(itensComVencimento), [itensComVencimento]);

  const datasComVencimento = itensComVencimento
    .filter(c => c.dataVencimento)
    .map(c => parseISO(c.dataVencimento!));

  // Summary counts
  const counts = {
    vencidos: grouped['Vencidos'].length,
    hoje: grouped['Vence Hoje'].length,
    tres: grouped['Próximos 3 dias'].length,
    sete: grouped['Próximos 7 dias'].length,
    validos: grouped['Válidos'].length,
  };

  const groupColors: Record<string, string> = {
    'Vencidos': 'text-destructive',
    'Vence Hoje': 'text-warning',
    'Próximos 3 dias': 'text-warning',
    'Próximos 7 dias': 'text-info',
    'Válidos': 'text-success',
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Agenda de Vencimentos" subtitle={`${itensComVencimento.length} itens com vencimento`} />

      {/* Summary Bar */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Vencidos', value: counts.vencidos, color: 'bg-destructive/10 text-destructive border-destructive/20' },
          { label: 'Hoje', value: counts.hoje, color: 'bg-warning/10 text-warning border-warning/20' },
          { label: '3 dias', value: counts.tres, color: 'bg-warning/10 text-warning border-warning/20' },
          { label: '7 dias', value: counts.sete, color: 'bg-info/10 text-info border-info/20' },
          { label: 'Válidos', value: counts.validos, color: 'bg-success/10 text-success border-success/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg border px-3 py-2 text-center min-w-[80px]', s.color)}>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="lista">
        <TabsList className="bg-muted/30 p-1">
          <TabsTrigger value="lista" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><List className="h-3.5 w-3.5" />Lista</TabsTrigger>
          <TabsTrigger value="calendario" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><CalendarDays className="h-3.5 w-3.5" />Calendário</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"><Clock className="h-3.5 w-3.5" />Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-6 mt-4">
          {Object.entries(grouped).filter(([, items]) => items.length > 0).map(([group, items]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h3 className={cn('text-xs font-semibold uppercase tracking-wider', groupColors[group])}>{group}</h3>
                <span className="text-[10px] text-muted-foreground">({items.length})</span>
              </div>
              <div className="space-y-1.5">
                {items.map(item => {
                  const empresa = mockEmpresas.find(e => e.id === item.empresaId);
                  const prio = getPrioridadeVencimento(item.dataVencimento);
                  return (
                    <div
                      key={item.id}
                      className="data-row glass-card-subtle p-3.5"
                      onClick={() => navigate(`/empresas/${item.empresaId}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn('flex h-7 min-w-16 items-center justify-center rounded-md text-[10px] font-bold shrink-0', prio.color)}>
                          {prio.label}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{empresa?.nomeFantasia} — {getCNDTipoLabel(item.tipo)}</p>
                          <p className="text-[11px] text-muted-foreground">Vencimento: {formatDate(item.dataVencimento)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={item.status} />
                        <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="calendario" className="mt-4">
          <GlassCard className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={{ vencimento: datasComVencimento }}
              modifiersStyles={{ vencimento: { fontWeight: 'bold', textDecoration: 'underline', color: 'hsl(var(--warning))' } }}
            />
          </GlassCard>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="relative border-l-2 border-border/60 ml-6 space-y-3 py-2">
            {itensComVencimento.map(item => {
              const empresa = mockEmpresas.find(e => e.id === item.empresaId);
              const prio = getPrioridadeVencimento(item.dataVencimento);
              return (
                <div key={item.id} className="relative pl-8 cursor-pointer" onClick={() => navigate(`/empresas/${item.empresaId}`)}>
                  <div className={cn('absolute -left-[7px] top-3 h-3 w-3 rounded-full border-2 bg-background', 
                    item.status === 'vencida' ? 'border-destructive' : 
                    item.status === 'vencendo' ? 'border-warning' : 'border-success'
                  )} />
                  <div className="glass-card-subtle p-3.5 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{empresa?.nomeFantasia} — {getCNDTipoLabel(item.tipo)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(item.dataVencimento)} • {prio.label}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
