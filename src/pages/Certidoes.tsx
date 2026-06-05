import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/data/DataProvider';
import { StatusBadge } from '@/components/StatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatDate, getCNDTipoLabel } from '@/lib/formatters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ShieldCheck, Eye, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 20;

export default function Certidoes() {
  const navigate = useNavigate();
  const { state } = useDataStore();
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);

  const itensFiltrados = useMemo(() => {
    return state.cnds.filter(c => {
      const empresa = state.empresas.find(e => e.id === c.empresaId);
      const matchBusca = !busca || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus;
      const matchTipo = filtroTipo === 'todos' || c.tipo === filtroTipo;
      return matchBusca && matchStatus && matchTipo;
    });
  }, [state.cnds, state.empresas, busca, filtroStatus, filtroTipo]);

  const paginatedItems = useMemo(() => itensFiltrados.slice(0, page * ITEMS_PER_PAGE), [itensFiltrados, page]);
  const hasMore = paginatedItems.length < itensFiltrados.length;

  const counts = useMemo(() => ({
    validas: state.cnds.filter(c => c.status === 'valida').length,
    vencendo: state.cnds.filter(c => c.status === 'vencendo').length,
    vencidas: state.cnds.filter(c => c.status === 'vencida').length,
    pendentes: state.cnds.filter(c => c.status === 'pendente').length,
  }), [state.cnds]);

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Certidões / CNDs" subtitle="Checklist de certidões por empresa" />

      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Válidas', value: counts.validas, color: 'bg-success/10 text-success border-success/20' },
          { label: 'Vencendo', value: counts.vencendo, color: 'bg-warning/10 text-warning border-warning/20' },
          { label: 'Vencidas', value: counts.vencidas, color: 'bg-destructive/10 text-destructive border-destructive/20' },
          { label: 'Pendentes', value: counts.pendentes, color: 'bg-info/10 text-info border-info/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold', s.color)}>
            {s.value} {s.label}
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 bg-transparent" />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="valida">Válida</SelectItem>
              <SelectItem value="vencendo">Vencendo</SelectItem>
              <SelectItem value="vencida">Vencida</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="receita_federal">Receita Federal</SelectItem>
              <SelectItem value="fgts">FGTS</SelectItem>
              <SelectItem value="sefaz">SEFAZ</SelectItem>
              <SelectItem value="municipal">Municipal</SelectItem>
              <SelectItem value="trabalhista">Trabalhista</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        {paginatedItems.map((item) => {
          const empresa = state.empresas.find(e => e.id === item.empresaId);
          return (
            <div key={item.id} className={cn('glass-card-subtle p-4 transition-all hover:shadow-sm', item.status === 'vencida' && 'border-l-3 border-l-destructive')}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${item.empresaId}`)}>{empresa?.nomeFantasia}</p>
                      <span className="text-[10px] text-foreground/30">•</span>
                      <p className="text-sm text-foreground/76">{getCNDTipoLabel(item.tipo)}</p>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex gap-4 text-[11px] text-foreground/72 mt-0.5">
                      {item.dataEmissao && <span>Emissão: {formatDate(item.dataEmissao)}</span>}
                      {item.dataVencimento && <span>Vencimento: {formatDate(item.dataVencimento)}</span>}
                      <span>Resp: {item.responsavel}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {item.arquivoId ? (
                    <Button variant="outline" size="sm" className="text-xs gap-1 h-8"><Eye className="h-3 w-3" />PDF</Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs gap-1 h-8"><FileText className="h-3 w-3" />Anexar</Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Carregar mais ({itensFiltrados.length - paginatedItems.length} restantes)</Button>
          </div>
        )}
        {itensFiltrados.length === 0 && (
          <EmptyState icon={ShieldCheck} title="Nenhuma certidão encontrada" description="Tente ajustar os filtros." />
        )}
      </div>
    </div>
  );
}
