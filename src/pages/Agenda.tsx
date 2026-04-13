import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockCNDItems, mockEmpresas } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const itensComVencimento = mockCNDItems
    .filter(c => c.dataVencimento && c.status !== 'nao_aplicavel')
    .sort((a, b) => {
      const pa = getPrioridadeVencimento(a.dataVencimento);
      const pb = getPrioridadeVencimento(b.dataVencimento);
      return pa.urgencia - pb.urgencia;
    });

  const datasComVencimento = itensComVencimento
    .filter(c => c.dataVencimento)
    .map(c => parseISO(c.dataVencimento!));

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda de Vencimentos</h1>
        <p className="text-sm text-muted-foreground mt-1">{itensComVencimento.length} itens com vencimento</p>
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista" className="gap-1.5"><List className="h-3.5 w-3.5" />Lista</TabsTrigger>
          <TabsTrigger value="calendario" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Calendário</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-2 mt-4">
          {itensComVencimento.map(item => {
            const empresa = mockEmpresas.find(e => e.id === item.empresaId);
            const prio = getPrioridadeVencimento(item.dataVencimento);
            return (
              <GlassCard key={item.id} hover className="cursor-pointer p-4" onClick={() => navigate(`/empresas/${item.empresaId}`)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('flex h-8 min-w-20 items-center justify-center rounded-md text-[11px] font-bold', prio.color)}>
                      {prio.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{empresa?.nomeFantasia} — {getCNDTipoLabel(item.tipo)}</p>
                      <p className="text-[11px] text-muted-foreground">Vencimento: {formatDate(item.dataVencimento)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </TabsContent>

        <TabsContent value="calendario" className="mt-4">
          <GlassCard className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              modifiers={{ vencimento: datasComVencimento }}
              modifiersStyles={{ vencimento: { fontWeight: 'bold', textDecoration: 'underline' } }}
            />
          </GlassCard>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="relative border-l-2 border-border ml-6 space-y-4 py-2">
            {itensComVencimento.map(item => {
              const empresa = mockEmpresas.find(e => e.id === item.empresaId);
              const prio = getPrioridadeVencimento(item.dataVencimento);
              return (
                <div key={item.id} className="relative pl-8 cursor-pointer" onClick={() => navigate(`/empresas/${item.empresaId}`)}>
                  <div className={cn('absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 bg-background', 
                    item.status === 'vencida' ? 'border-destructive' : 
                    item.status === 'vencendo' ? 'border-warning' : 'border-success'
                  )} />
                  <GlassCard className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{empresa?.nomeFantasia} — {getCNDTipoLabel(item.tipo)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(item.dataVencimento)} • {prio.label}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </GlassCard>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
