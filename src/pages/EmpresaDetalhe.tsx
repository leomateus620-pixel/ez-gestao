import { useParams, useNavigate } from 'react-router-dom';
import { mockEmpresas, mockCNDItems, mockDocumentos, mockEnvios, mockAlertas, mockLogs } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCNPJ, formatPhone, formatDate, formatDateTime, getRegimeLabel, getCNDTipoLabel } from '@/lib/formatters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Mail, Phone, MapPin, FileText, Send, Clock, Download, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EmpresaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const empresa = mockEmpresas.find(e => e.id === id);

  if (!empresa) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Empresa não encontrada</p>
      </div>
    );
  }

  const cnds = mockCNDItems.filter(c => c.empresaId === id);
  const docs = mockDocumentos.filter(d => d.empresaId === id);
  const envios = mockEnvios.filter(e => e.empresaId === id);
  const alertas = mockAlertas.filter(a => a.empresaId === id && !a.resolvido);
  const logs = mockLogs.filter(l => l.empresaId === id);

  const vencidas = cnds.filter(c => c.status === 'vencida').length;
  const vencendo = cnds.filter(c => c.status === 'vencendo').length;
  const validas = cnds.filter(c => c.status === 'valida').length;

  return (
    <div className="space-y-6 animate-slide-in">
      <Button variant="ghost" size="sm" onClick={() => navigate('/empresas')} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <GlassCard>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{empresa.nomeFantasia}</h1>
                <StatusBadge status={empresa.status} variant="empresa" />
              </div>
              <p className="text-sm text-muted-foreground">{empresa.razaoSocial}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span className="font-mono">{formatCNPJ(empresa.cnpj)}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{empresa.municipio}/{empresa.estado}</span>
                <span>{getRegimeLabel(empresa.regimeTributario)}</span>
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{empresa.emailPrincipal}</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{formatPhone(empresa.whatsappPrincipal)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="text-center px-3">
              <p className="text-lg font-bold text-destructive">{vencidas}</p>
              <p className="text-[10px] text-muted-foreground">Vencidas</p>
            </div>
            <div className="text-center px-3 border-l border-border">
              <p className="text-lg font-bold text-warning">{vencendo}</p>
              <p className="text-[10px] text-muted-foreground">Vencendo</p>
            </div>
            <div className="text-center px-3 border-l border-border">
              <p className="text-lg font-bold text-success">{validas}</p>
              <p className="text-[10px] text-muted-foreground">Válidas</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {alertas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {alertas.map(a => (
            <div key={a.id} className={cn('shrink-0 rounded-lg border px-3 py-1.5 text-xs', !a.lido && 'border-l-2 border-l-warning')}>
              <StatusBadge status={a.prioridade} variant="prioridade" dot={false} className="mr-1.5 text-[10px]" />
              {a.titulo}
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="checklist">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="checklist">Checklist CNDs</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({docs.length})</TabsTrigger>
          <TabsTrigger value="envios">Envios ({envios.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
          <TabsTrigger value="observacoes">Observações</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-2 mt-4">
          {cnds.length === 0 ? (
            <GlassCard className="text-center py-8"><p className="text-sm text-muted-foreground">Nenhuma certidão cadastrada</p></GlassCard>
          ) : (
            cnds.map(cnd => (
              <GlassCard key={cnd.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{getCNDTipoLabel(cnd.tipo)}</p>
                      <StatusBadge status={cnd.status} />
                    </div>
                    <div className="flex gap-4 text-[11px] text-muted-foreground">
                      {cnd.dataEmissao && <span>Emissão: {formatDate(cnd.dataEmissao)}</span>}
                      {cnd.dataVencimento && <span>Vencimento: {formatDate(cnd.dataVencimento)}</span>}
                      {cnd.origem && <span>Origem: {cnd.origem}</span>}
                    </div>
                    {cnd.observacao && <p className="text-[11px] text-muted-foreground italic">{cnd.observacao}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {cnd.arquivoId ? (
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <Eye className="h-3 w-3" /> Ver PDF
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <FileText className="h-3 w-3" /> Anexar PDF
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="documentos" className="space-y-2 mt-4">
          {docs.length === 0 ? (
            <GlassCard className="text-center py-8"><p className="text-sm text-muted-foreground">Nenhum documento</p></GlassCard>
          ) : (
            docs.map(doc => (
              <GlassCard key={doc.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.nome}</p>
                      <div className="flex gap-3 text-[11px] text-muted-foreground">
                        <span>{getCNDTipoLabel(doc.tipo)}</span>
                        <span>v{doc.versao}</span>
                        <span>{doc.tamanho}</span>
                        <span>{formatDate(doc.dataUpload)}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0"><Download className="h-4 w-4" /></Button>
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="envios" className="space-y-2 mt-4">
          {envios.length === 0 ? (
            <GlassCard className="text-center py-8"><p className="text-sm text-muted-foreground">Nenhum envio</p></GlassCard>
          ) : (
            envios.map(envio => (
              <GlassCard key={envio.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Send className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{envio.canal === 'email' ? envio.assunto || 'E-mail' : 'WhatsApp'}</p>
                      <div className="flex gap-3 text-[11px] text-muted-foreground">
                        <span>{envio.destinatario}</span>
                        <span>{formatDateTime(envio.dataEnvio)}</span>
                        <span>{envio.documentoIds.length} doc(s)</span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={envio.status} dot={false} />
                </div>
              </GlassCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-2 mt-4">
          {logs.length === 0 ? (
            <GlassCard className="text-center py-8"><p className="text-sm text-muted-foreground">Nenhum log</p></GlassCard>
          ) : (
            <div className="relative border-l-2 border-border ml-4 space-y-4 py-2">
              {logs.map(log => (
                <div key={log.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                  <div className="text-sm font-medium">{log.detalhes}</div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span><Clock className="h-3 w-3 inline mr-1" />{formatDateTime(log.dataHora)}</span>
                    <span>{log.usuario}</span>
                    {log.canal && <span className="capitalize">{log.canal}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="observacoes" className="mt-4">
          <GlassCard>
            <p className="text-sm">{empresa.observacoes || 'Nenhuma observação registrada.'}</p>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
