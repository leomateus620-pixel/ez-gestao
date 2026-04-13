import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockEmpresas, mockCNDItems } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCNPJ, getRegimeLabel } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Building2, MapPin, ArrowRight } from 'lucide-react';

export default function Empresas() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroRegime, setFiltroRegime] = useState<string>('todos');

  const empresasFiltradas = useMemo(() => {
    return mockEmpresas.filter(e => {
      const matchBusca = !busca || 
        e.razaoSocial.toLowerCase().includes(busca.toLowerCase()) ||
        e.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) ||
        e.cnpj.includes(busca.replace(/\D/g, '')) ||
        e.municipio.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
      const matchRegime = filtroRegime === 'todos' || e.regimeTributario === filtroRegime;
      return matchBusca && matchStatus && matchRegime;
    });
  }, [busca, filtroStatus, filtroRegime]);

  const getEmpresaResumo = (empresaId: string) => {
    const cnds = mockCNDItems.filter(c => c.empresaId === empresaId);
    const vencidas = cnds.filter(c => c.status === 'vencida').length;
    const vencendo = cnds.filter(c => c.status === 'vencendo').length;
    const validas = cnds.filter(c => c.status === 'valida').length;
    return { total: cnds.length, vencidas, vencendo, validas };
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground mt-1">{mockEmpresas.length} empresas cadastradas</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      <GlassCard className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social, CNPJ, município..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="arquivada">Arquivada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroRegime} onValueChange={setFiltroRegime}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Regime" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os regimes</SelectItem>
              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
              <SelectItem value="lucro_real">Lucro Real</SelectItem>
              <SelectItem value="mei">MEI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      <div className="grid gap-3">
        {empresasFiltradas.map(empresa => {
          const resumo = getEmpresaResumo(empresa.id);
          return (
            <GlassCard
              key={empresa.id}
              hover
              className="cursor-pointer"
              onClick={() => navigate(`/empresas/${empresa.id}`)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{empresa.nomeFantasia}</p>
                      <StatusBadge status={empresa.status} variant="empresa" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{empresa.razaoSocial}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span className="font-mono">{formatCNPJ(empresa.cnpj)}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {empresa.municipio}/{empresa.estado}
                      </span>
                      <span className="hidden sm:inline">{getRegimeLabel(empresa.regimeTributario)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex gap-2">
                    {resumo.vencidas > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                        {resumo.vencidas}
                      </span>
                    )}
                    {resumo.vencendo > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        {resumo.vencendo}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      {resumo.validas}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </GlassCard>
          );
        })}
        {empresasFiltradas.length === 0 && (
          <GlassCard className="text-center py-12">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
