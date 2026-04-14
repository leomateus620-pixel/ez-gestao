import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockEmpresas, mockCNDItems } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { HealthBar } from '@/components/HealthBar';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatCNPJ, getRegimeLabel } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Building2, MapPin, ArrowRight, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortField = 'nome' | 'vencidas' | 'status';

export default function Empresas() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroRegime, setFiltroRegime] = useState<string>('todos');
  const [sortBy, setSortBy] = useState<SortField>('nome');

  const empresasFiltradas = useMemo(() => {
    const filtered = mockEmpresas.filter(e => {
      const matchBusca = !busca || 
        e.razaoSocial.toLowerCase().includes(busca.toLowerCase()) ||
        e.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) ||
        e.cnpj.includes(busca.replace(/\D/g, '')) ||
        e.municipio.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
      const matchRegime = filtroRegime === 'todos' || e.regimeTributario === filtroRegime;
      return matchBusca && matchStatus && matchRegime;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'nome') return a.nomeFantasia.localeCompare(b.nomeFantasia);
      if (sortBy === 'vencidas') {
        const va = mockCNDItems.filter(c => c.empresaId === a.id && c.status === 'vencida').length;
        const vb = mockCNDItems.filter(c => c.empresaId === b.id && c.status === 'vencida').length;
        return vb - va;
      }
      return 0;
    });
  }, [busca, filtroStatus, filtroRegime, sortBy]);

  const getEmpresaResumo = (empresaId: string) => {
    const cnds = mockCNDItems.filter(c => c.empresaId === empresaId);
    const vencidas = cnds.filter(c => c.status === 'vencida').length;
    const vencendo = cnds.filter(c => c.status === 'vencendo').length;
    const validas = cnds.filter(c => c.status === 'valida').length;
    const pendentes = cnds.filter(c => c.status === 'pendente' || c.status === 'erro').length;
    return { total: cnds.length, vencidas, vencendo, validas, pendentes };
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Empresas" subtitle={`${mockEmpresas.length} empresas cadastradas`}>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </PageHeader>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social, CNPJ, município..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 bg-transparent"
            />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="arquivada">Arquivada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroRegime} onValueChange={setFiltroRegime}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Regime" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os regimes</SelectItem>
              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
              <SelectItem value="lucro_real">Lucro Real</SelectItem>
              <SelectItem value="mei">MEI</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
            <SelectTrigger className="w-full sm:w-40">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="h-3 w-3" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Nome A-Z</SelectItem>
              <SelectItem value="vencidas">Mais vencidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Company List */}
      <div className="space-y-2">
        {empresasFiltradas.map((empresa, i) => {
          const resumo = getEmpresaResumo(empresa.id);
          return (
            <div
              key={empresa.id}
              className={cn(
                'glass-card p-4 cursor-pointer transition-all duration-200 hover:shadow-md group',
                i % 2 === 1 && 'bg-card/30'
              )}
              onClick={() => navigate(`/empresas/${empresa.id}`)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary text-xs font-bold">
                    {empresa.nomeFantasia.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{empresa.nomeFantasia}</p>
                      <StatusBadge status={empresa.status} variant="empresa" />
                    </div>
                    <p className="text-[11px] text-foreground/60 truncate">{empresa.razaoSocial}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-foreground/60">
                      <span className="font-mono">{formatCNPJ(empresa.cnpj)}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {empresa.municipio}/{empresa.estado}
                      </span>
                      <span className="hidden sm:inline">{getRegimeLabel(empresa.regimeTributario)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                  {resumo.total > 0 && (
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex gap-3">
                        {resumo.vencidas > 0 && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                            {resumo.vencidas}
                          </span>
                        )}
                        {resumo.vencendo > 0 && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-warning">
                            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                            {resumo.vencendo}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" />
                          {resumo.validas}
                        </span>
                      </div>
                      <HealthBar
                        validas={resumo.validas}
                        vencendo={resumo.vencendo}
                        vencidas={resumo.vencidas}
                        pendentes={resumo.pendentes}
                        total={resumo.total}
                        className="w-32"
                      />
                    </div>
                  )}
                  <ArrowRight className="h-4 w-4 text-foreground/30 group-hover:text-foreground/60 transition-colors" />
                </div>
              </div>
            </div>
          );
        })}
        {empresasFiltradas.length === 0 && (
          <EmptyState
            icon={Building2}
            title="Nenhuma empresa encontrada"
            description="Tente ajustar os filtros ou adicione uma nova empresa."
            actionLabel="Nova Empresa"
            onAction={() => {}}
          />
        )}
      </div>
    </div>
  );
}
