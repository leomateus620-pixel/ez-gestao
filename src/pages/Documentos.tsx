import { useState, useMemo } from 'react';
import { useDataStore } from '@/data/DataProvider';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatDate, getCNDTipoLabel } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, FileText, Download, Eye, Upload, Grid, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 20;

export default function Documentos() {
  const { state } = useDataStore();
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [page, setPage] = useState(1);

  const docsFiltrados = useMemo(() => {
    return state.documentos.filter(d => {
      const empresa = state.empresas.find(e => e.id === d.empresaId);
      const matchBusca = !busca || d.nome.toLowerCase().includes(busca.toLowerCase()) || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || d.tipo === filtroTipo;
      return matchBusca && matchTipo;
    });
  }, [state.documentos, state.empresas, busca, filtroTipo]);

  const paginatedDocs = useMemo(() => docsFiltrados.slice(0, page * ITEMS_PER_PAGE), [docsFiltrados, page]);
  const hasMore = paginatedDocs.length < docsFiltrados.length;

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Documentos" subtitle="Biblioteca centralizada de PDFs">
        <Button className="gap-2" onClick={() => toast.info('Upload', { description: 'Use o botão Upload na página da empresa.' })}><Upload className="h-4 w-4" />Upload</Button>
      </PageHeader>

      <div className="filter-bar">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar documento ou empresa..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 bg-transparent" />
          </div>
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
          <div className="flex gap-1 border border-border/50 rounded-md p-0.5">
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')}><List className="h-3.5 w-3.5" /></Button>
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')}><Grid className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-foreground/70 px-1">
        <span>{docsFiltrados.length} documentos</span>
        <span className="text-foreground/30">•</span>
        <span>~{(docsFiltrados.length * 0.2).toFixed(1)} MB utilizados</span>
      </div>

      <div className={cn(viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3' : 'space-y-1.5')}>
        {paginatedDocs.map(doc => {
          const empresa = state.empresas.find(e => e.id === doc.empresaId);
          if (viewMode === 'grid') {
            return (
              <div key={doc.id} className="glass-card-subtle p-4 hover:shadow-sm transition-all flex flex-col items-center text-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8"><FileText className="h-6 w-6 text-primary" /></div>
                <p className="text-xs font-medium truncate w-full">{doc.nome}</p>
                <p className="text-[10px] text-foreground/70">{empresa?.nomeFantasia}</p>
                <p className="text-[10px] text-foreground/68">{doc.tamanho} • v{doc.versao}</p>
                <div className="flex gap-1 mt-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          }
          return (
            <div key={doc.id} className="glass-card-subtle p-4 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8"><FileText className="h-5 w-5 text-primary" /></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.nome}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-foreground/72">
                      <span>{empresa?.nomeFantasia}</span>
                      <span>{getCNDTipoLabel(doc.tipo)}</span>
                      <span>v{doc.versao}</span>
                      <span>{doc.tamanho}</span>
                      <span>Upload: {formatDate(doc.dataUpload)}</span>
                      {doc.validade && <span>Validade: {formatDate(doc.validade)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className={cn('flex justify-center pt-4', viewMode === 'grid' && 'col-span-full')}>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Carregar mais</Button>
          </div>
        )}
        {docsFiltrados.length === 0 && (
          <EmptyState icon={FileText} title="Nenhum documento encontrado" description="Tente ajustar os filtros ou faça upload de novos documentos." actionLabel="Upload" onAction={() => {}} />
        )}
      </div>
    </div>
  );
}
