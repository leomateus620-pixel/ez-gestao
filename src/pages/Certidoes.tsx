import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockCNDItems, mockEmpresas } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate, getCNDTipoLabel } from '@/lib/formatters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, ShieldCheck, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Certidoes() {
  const navigate = useNavigate();
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busca, setBusca] = useState('');

  const itensFiltrados = useMemo(() => {
    return mockCNDItems.filter(c => {
      const empresa = mockEmpresas.find(e => e.id === c.empresaId);
      const matchBusca = !busca || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus;
      const matchTipo = filtroTipo === 'todos' || c.tipo === filtroTipo;
      return matchBusca && matchStatus && matchTipo;
    });
  }, [busca, filtroStatus, filtroTipo]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certidões / CNDs</h1>
        <p className="text-sm text-muted-foreground mt-1">Checklist de certidões por empresa</p>
      </div>

      <GlassCard className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
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
      </GlassCard>

      <div className="space-y-2">
        {itensFiltrados.map(item => {
          const empresa = mockEmpresas.find(e => e.id === item.empresaId);
          return (
            <GlassCard key={item.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium cursor-pointer hover:underline" onClick={() => navigate(`/empresas/${item.empresaId}`)}>
                        {empresa?.nomeFantasia}
                      </p>
                      <span className="text-xs text-muted-foreground">•</span>
                      <p className="text-sm">{getCNDTipoLabel(item.tipo)}</p>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex gap-4 text-[11px] text-muted-foreground mt-0.5">
                      {item.dataEmissao && <span>Emissão: {formatDate(item.dataEmissao)}</span>}
                      {item.dataVencimento && <span>Vencimento: {formatDate(item.dataVencimento)}</span>}
                      <span>Resp: {item.responsavel}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {item.arquivoId ? (
                    <Button variant="outline" size="sm" className="text-xs gap-1"><Eye className="h-3 w-3" />PDF</Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs gap-1"><FileText className="h-3 w-3" />Anexar</Button>
                  )}
                </div>
              </div>
            </GlassCard>
          );
        })}
        {itensFiltrados.length === 0 && (
          <GlassCard className="text-center py-12">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma certidão encontrada</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
