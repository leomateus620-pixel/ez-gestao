import { useState, useMemo } from 'react';
import { mockEnvios, mockEmpresas, mockDocumentos } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, Send, Mail, MessageCircle, Plus } from 'lucide-react';

export default function Envios() {
  const [busca, setBusca] = useState('');
  const [filtroCanal, setFiltroCanal] = useState('todos');

  const enviosFiltrados = useMemo(() => {
    return mockEnvios.filter(e => {
      const empresa = mockEmpresas.find(emp => emp.id === e.empresaId);
      const matchBusca = !busca || empresa?.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) || e.destinatario.toLowerCase().includes(busca.toLowerCase());
      const matchCanal = filtroCanal === 'todos' || e.canal === filtroCanal;
      return matchBusca && matchCanal;
    });
  }, [busca, filtroCanal]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Envios</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico de envios por e-mail e WhatsApp</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" />Novo Envio</Button>
      </div>

      <GlassCard className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa ou destinatário..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
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
      </GlassCard>

      <div className="space-y-2">
        {enviosFiltrados.map(envio => {
          const empresa = mockEmpresas.find(e => e.id === envio.empresaId);
          const docs = mockDocumentos.filter(d => envio.documentoIds.includes(d.id));
          return (
            <GlassCard key={envio.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {envio.canal === 'email' ? <Mail className="h-5 w-5 text-primary shrink-0" /> : <MessageCircle className="h-5 w-5 text-success shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{empresa?.nomeFantasia}</p>
                      <StatusBadge status={envio.status} dot={false} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      <span>{envio.destinatario}</span>
                      <span>{formatDateTime(envio.dataEnvio)}</span>
                      <span>{docs.length} documento(s)</span>
                      <span>por {envio.usuario}</span>
                    </div>
                    {envio.mensagem && <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-1">{envio.mensagem}</p>}
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
        {enviosFiltrados.length === 0 && (
          <GlassCard className="text-center py-12">
            <Send className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum envio encontrado</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
