import { useState, useMemo } from 'react';
import { mockDocumentos, mockEmpresas } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { formatDate, getCNDTipoLabel } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, FileText, Download, Eye, Upload } from 'lucide-react';

export default function Documentos() {
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  const docsFiltrados = useMemo(() => {
    return mockDocumentos.filter(d => {
      const empresa = mockEmpresas.find(e => e.id === d.empresaId);
      const matchBusca = !busca || d.nome.toLowerCase().includes(busca.toLowerCase()) || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase());
      const matchTipo = filtroTipo === 'todos' || d.tipo === filtroTipo;
      return matchBusca && matchTipo;
    });
  }, [busca, filtroTipo]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Biblioteca centralizada de PDFs</p>
        </div>
        <Button className="gap-2"><Upload className="h-4 w-4" />Upload</Button>
      </div>

      <GlassCard className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar documento ou empresa..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
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
        </div>
      </GlassCard>

      <div className="grid gap-2">
        {docsFiltrados.map(doc => {
          const empresa = mockEmpresas.find(e => e.id === doc.empresaId);
          return (
            <GlassCard key={doc.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.nome}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{empresa?.nomeFantasia}</span>
                      <span>{getCNDTipoLabel(doc.tipo)}</span>
                      <span>v{doc.versao}</span>
                      <span>{doc.tamanho}</span>
                      <span>Upload: {formatDate(doc.dataUpload)}</span>
                      {doc.validade && <span>Validade: {formatDate(doc.validade)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button>
                </div>
              </div>
            </GlassCard>
          );
        })}
        {docsFiltrados.length === 0 && (
          <GlassCard className="text-center py-12">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
