import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/data/DataProvider';
import { useAgendaEngine } from '@/hooks/useAgendaEngine';
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
import { parseISO } from 'date-fns';

export default function Agenda() {
  const navigate = useNavigate();
  const { state } = useDataStore();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const { items, counts, grouped } = useAgendaEngine(state.cnds, state.empresas);

  const datasComVencimento = useMemo(() =>
    items.filter(i => i.cnd.dataVencimento).map(i => parseISO(i.cnd.dataVencimento!)),
    [items]
  );

  const groupColors: Record<string, string> = {
    'Vencidos': 'text-destructive',
    'Vence Hoje': 'text-warning',
    'Próximos 3 dias': 'text-warning',
    'Próximos 7 dias': 'text-info',
    'Válidos': 'text-success',
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Agenda de Vencimentos" subtitle={`${items.length} itens com vencimento`} />

      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Vencidos', value: counts.vencidos, color: 'bg-destructive/10 text-destructive border-destructive/20' },
          { label: 'Hoje', value: counts.hoje, color: 'bg-warning/10 text-warning border-warning/20' },
          { label: '3 dias', value: counts.tresDias, color: 'bg-warning/10 text-warning border-warning/20' },
          { label: '7 dias', value: counts.seteDias, color: 'bg-info/10 text-info border-info/20' },
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
          {Object.entries(grouped).filter(([, items]) => items.length > 0).map(([group, groupItems]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h3 className={cn('text-xs font-semibold uppercase tracking-wider', groupColors[group])}>{group}</h3>
                <span className="text-[10px] text-foreground/50">({groupItems.length})</span>
              </div>
              <div className="space-y-1.5">
                {groupItems.map(item => (
                  <div key={item.cnd.id} className="data-row glass-card-subtle p-3.5" onClick={() => navigate(`/empresas/${item.cnd.empresaId}`)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn('flex h-7 min-w-16 items-center justify-center rounded-md text-[10px] font-bold shrink-0', item.color)}>
                        {item.label}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.empresa.nomeFantasia} — {getCNDTipoLabel(item.cnd.tipo)}</p>
                        <p className="text-[11px] text-foreground/60">Vencimento: {formatDate(item.cnd.dataVencimento)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={item.cnd.status} />
                      <ArrowRight className="h-4 w-4 text-foreground/30" />
                    </div>
                  </div>
                ))}
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
            {items.map(item => (
              <div key={item.cnd.id} className="relative pl-8 cursor-pointer" onClick={() => navigate(`/empresas/${item.cnd.empresaId}`)}>
                <div className={cn('absolute -left-[7px] top-3 h-3 w-3 rounded-full border-2 bg-background',
                  item.cnd.status === 'vencida' ? 'border-destructive' :
                  item.cnd.status === 'vencendo' ? 'border-warning' : 'border-success'
                )} />
                <div className="glass-card-subtle p-3.5 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{item.empresa.nomeFantasia} — {getCNDTipoLabel(item.cnd.tipo)}</p>
                      <p className="text-[11px] text-foreground/60">{formatDate(item.cnd.dataVencimento)} • {item.label}</p>
                    </div>
                    <StatusBadge status={item.cnd.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
