import { useState, useMemo } from 'react';
import { useDataStore } from '@/data/DataProvider';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, Send, Mail, MessageCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 20;

export default function Envios() {
  const { state } = useDataStore();
  const [busca, setBusca] = useState('');
  const [filtroCanal, setFiltroCanal] = useState('todos');
  const [page, setPage] = useState(1);

  const enviosFiltrados = useMemo(() => {
    return state.envios.filter(e => {
      const empresa = state.empresas.find(emp => emp.id === e.empresaId);
      const matchBusca = !busca || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) || e.destinatario.toLowerCase().includes(busca.toLowerCase());
      const matchCanal = filtroCanal === 'todos' || e.canal === filtroCanal;
      return matchBusca && matchCanal;
    }).sort((a, b) => new Date(b.dataEnvio).getTime() - new Date(a.dataEnvio).getTime());
  }, [state.envios, state.empresas, busca, filtroCanal]);

  const paginatedEnvios = useMemo(() => enviosFiltrados.slice(0, page * ITEMS_PER_PAGE), [enviosFiltrados, page]);
  const hasMore = paginatedEnvios.length < enviosFiltrados.length;

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Envios" subtitle="Histórico de envios por e-mail e WhatsApp">
        <Button className="gap-2" onClick={() => toast.info('Novo Envio', { description: 'Fluxo assistido disponível na Fase 2.' })}><Plus className="h-4 w-4" />Novo Envio</Button>
      </PageHeader>

      <div className="filter-bar">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa ou destinatário..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 bg-transparent" />
          </div>
          <Select value={filtroCanal} onValueChange={setFiltroCanal}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {paginatedEnvios.map(envio => {
          const empresa = state.empresas.find(e => e.id === envio.empresaId);
          const docs = state.documentos.filter(d => envio.documentoIds.includes(d.id));
          return (
            <div key={envio.id} className="glass-card-subtle p-4 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', envio.canal === 'email' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success')}>
                    {envio.canal === 'email' ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{empresa?.nomeFantasia}</p>
                      <StatusBadge status={envio.status} dot={false} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-foreground/60">
                      <span>{envio.destinatario}</span>
                      <span>{formatDateTime(envio.dataEnvio)}</span>
                      <span>{docs.length} documento(s)</span>
                      <span>por {envio.usuario}</span>
                    </div>
                    {envio.mensagem && <p className="text-[11px] text-foreground/55 mt-1 italic line-clamp-1">{envio.mensagem}</p>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Carregar mais</Button>
          </div>
        )}
        {enviosFiltrados.length === 0 && (
          <EmptyState icon={Send} title="Nenhum envio encontrado" description="Crie um novo envio para começar." actionLabel="Novo Envio" onAction={() => {}} />
        )}
      </div>
    </div>
  );
}
