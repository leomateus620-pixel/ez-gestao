import { useParams, useNavigate } from 'react-router-dom';
import { mockEmpresas, mockCNDItems, mockDocumentos, mockEnvios, mockAlertas, mockLogs } from '@/data/mockData';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { HealthRing } from '@/components/HealthRing';
import { HealthBar } from '@/components/HealthBar';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatCNPJ, formatPhone, formatDate, formatDateTime, getRegimeLabel, getCNDTipoLabel } from '@/lib/formatters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Mail, Phone, MapPin, FileText, Send, Clock, Download, Eye, Upload, Bell, Edit, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EmpresaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const empresa = mockEmpresas.find(e => e.id === id);

  if (!empresa) {
    return (
      <EmptyState icon={Building2} title="Empresa não encontrada" description="Verifique o ID da empresa ou volte à listagem." actionLabel="Voltar" onAction={() => navigate('/empresas')} />
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
  const pendentes = cnds.filter(c => c.status === 'pendente' || c.status === 'erro').length;
  const pctValid = cnds.length > 0 ? Math.round((validas / cnds.length) * 100) : 100;

  const cndsByType = cnds.reduce<Record<string, typeof cnds>>((acc, c) => {
    if (!acc[c.tipo]) acc[c.tipo] = [];
    acc[c.tipo].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-slide-in">
      <Button variant="ghost" size="sm" onClick={() => navigate('/empresas')} className="gap-1.5 -ml-2 text-foreground/60 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      {/* Hero Header */}
      <GlassCard variant="elevated" className="p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 via-transparent to-accent/5 p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary text-lg font-bold">
                {empresa.nomeFantasia.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold tracking-tight">{empresa.nomeFantasia}</h1>
                  <StatusBadge status={empresa.status} variant="empresa" />
                </div>
                <p className="text-sm text-foreground/60 mt-0.5">{empresa.razaoSocial}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-foreground/65">
                  <span className="font-mono bg-muted/50 px-2 py-0.5 rounded">{formatCNPJ(empresa.cnpj)}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{empresa.municipio}/{empresa.estado}</span>
                  <span>{getRegimeLabel(empresa.regimeTributario)}</span>
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{empresa.emailPrincipal}</span>
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{formatPhone(empresa.whatsappPrincipal)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 shrink-0">
              <HealthRing percentage={pctValid} label="Saúde" />
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-destructive">{vencidas}</p>
                  <p className="text-[10px] text-foreground/50 font-medium">Vencidas</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-warning">{vencendo}</p>
                  <p className="text-[10px] text-foreground/50 font-medium">Vencendo</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-success">{validas}</p>
                  <p className="text-[10px] text-foreground/50 font-medium">Válidas</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 px-6 py-3 border-t border-border/40 bg-muted/20">
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <Upload className="h-3.5 w-3.5" /> Upload PDF
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <Send className="h-3.5 w-3.5" /> Enviar Documentos
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <Bell className="h-3.5 w-3.5" /> Gerar Alerta
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      </GlassCard>

      {/* Alerts strip */}
      {alertas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {alertas.map(a => (
            <div key={a.id} className={cn(
              'shrink-0 rounded-lg border px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-card/80',
              !a.lido && 'border-l-3 border-l-warning'
            )}>
              <StatusBadge status={a.prioridade} variant="prioridade" dot={false} className="text-[10px]" />
              <span className="font-medium">{a.titulo}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="checklist" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto bg-muted/30 p-1">
          <TabsTrigger value="checklist" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" /> Checklist CNDs
            <span className="ml-1 text-[10px] text-foreground/50">({cnds.length})</span>
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText className="h-3.5 w-3.5" /> Documentos
            <span className="ml-1 text-[10px] text-foreground/50">({docs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="envios" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Send className="h-3.5 w-3.5" /> Envios
            <span className="ml-1 text-[10px] text-foreground/50">({envios.length})</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Clock className="h-3.5 w-3.5" /> Logs
            <span className="ml-1 text-[10px] text-foreground/50">({logs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="observacoes" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Observações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-4">
          {cnds.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="Nenhuma certidão cadastrada" description="Adicione certidões ao checklist desta empresa." />
          ) : (
            <>
              <HealthBar validas={validas} vencendo={vencendo} vencidas={vencidas} pendentes={pendentes} total={cnds.length} showLabels className="px-1" />
              {Object.entries(cndsByType).map(([tipo, items]) => {
                const tipoValidas = items.filter(c => c.status === 'valida').length;
                return (
                  <div key={tipo}>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/55">{getCNDTipoLabel(tipo)}</h4>
                      <span className="text-[10px] text-foreground/50">{tipoValidas}/{items.length} válidas</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map(cnd => (
                        <div key={cnd.id} className={cn(
                          'glass-card-subtle p-4 transition-all duration-200 hover:shadow-sm',
                          cnd.status === 'vencida' && 'border-l-3 border-l-destructive'
                        )}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{getCNDTipoLabel(cnd.tipo)}</p>
                                <StatusBadge status={cnd.status} />
                              </div>
                              <div className="flex gap-4 text-[11px] text-foreground/60">
                                {cnd.dataEmissao && <span>Emissão: {formatDate(cnd.dataEmissao)}</span>}
                                {cnd.dataVencimento && <span>Vencimento: {formatDate(cnd.dataVencimento)}</span>}
                                {cnd.origem && <span>Origem: {cnd.origem}</span>}
                              </div>
                              {cnd.observacao && <p className="text-[11px] text-foreground/55 italic mt-0.5">{cnd.observacao}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {cnd.arquivoId ? (
                                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
                                  <Eye className="h-3 w-3" /> Ver PDF
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-8">
                                  <FileText className="h-3 w-3" /> Anexar PDF
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </TabsContent>

        <TabsContent value="documentos" className="space-y-2">
          {docs.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhum documento" description="Faça upload de PDFs para esta empresa." actionLabel="Upload" onAction={() => {}} />
          ) : (
            docs.map(doc => (
              <div key={doc.id} className="glass-card-subtle p-4 transition-all hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.nome}</p>
                      <div className="flex gap-3 text-[11px] text-foreground/60">
                        <span>{getCNDTipoLabel(doc.tipo)}</span>
                        <span>v{doc.versao}</span>
                        <span>{doc.tamanho}</span>
                        <span>{formatDate(doc.dataUpload)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="envios" className="space-y-2">
          {envios.length === 0 ? (
            <EmptyState icon={Send} title="Nenhum envio" description="Envie documentos para esta empresa." actionLabel="Novo Envio" onAction={() => {}} />
          ) : (
            envios.map(envio => (
              <div key={envio.id} className="glass-card-subtle p-4 transition-all hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                      envio.canal === 'email' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'
                    )}>
                      {envio.canal === 'email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{envio.canal === 'email' ? envio.assunto || 'E-mail' : 'WhatsApp'}</p>
                      <div className="flex gap-3 text-[11px] text-foreground/60">
                        <span>{envio.destinatario}</span>
                        <span>{formatDateTime(envio.dataEnvio)}</span>
                        <span>{envio.documentoIds.length} doc(s)</span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={envio.status} dot={false} />
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-0">
          {logs.length === 0 ? (
            <EmptyState icon={Clock} title="Nenhum log registrado" />
          ) : (
            <div className="relative border-l-2 border-border/60 ml-4 space-y-4 py-2">
              {logs.map(log => (
                <div key={log.id} className="relative pl-6">
                  <div className={cn(
                    'absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 bg-background',
                    log.acao === 'envio' ? 'border-primary' :
                    log.acao === 'download' ? 'border-success' :
                    log.acao === 'visualizacao' ? 'border-info' : 'border-warning'
                  )} />
                  <div className="text-sm font-medium">{log.detalhes}</div>
                  <div className="flex gap-3 text-[11px] text-foreground/60 mt-0.5">
                    <span>{formatDateTime(log.dataHora)}</span>
                    <span>{log.usuario}</span>
                    {log.canal && <span className="capitalize">{log.canal}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="observacoes">
          <GlassCard>
            <p className="text-sm leading-relaxed">{empresa.observacoes || 'Nenhuma observação registrada.'}</p>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
