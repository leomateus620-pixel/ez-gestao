import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useMemo, useRef } from 'react';
import { useDataStore } from '@/data/DataProvider';
import { useGuides } from '@/features/guias/GuideProvider';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { formatCNPJ, formatDate, formatDateTime, formatPhone, getDocumentoCategoriaLabel, getRegimeLabel } from '@/lib/formatters';
import { validatePDF } from '@/lib/file-validation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bell, Building2, Clock, Download, Edit, Eye, FileText, Mail, MapPin, Phone, Send, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { EmpresaAutomacaoCards } from '@/components/EmpresaAutomacaoCards';
import { openDocument } from '@/lib/document-actions';

export default function EmpresaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, addDocumento, addLog, markAlertaLido } = useDataStore();
  const { guides } = useGuides();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const empresa = useMemo(() => state.empresas.find((entry) => entry.id === id), [state.empresas, id]);
  const docs = useMemo(() => state.documentos.filter((entry) => entry.empresaId === id), [state.documentos, id]);
  const envios = useMemo(() => state.envios.filter((entry) => entry.empresaId === id), [state.envios, id]);
  const alertas = useMemo(() => state.alertas.filter((entry) => entry.empresaId === id && !entry.resolvido), [state.alertas, id]);
  const logs = useMemo(() => state.logs.filter((entry) => entry.empresaId === id), [state.logs, id]);
  const guias = useMemo(() => guides.filter((guide) => guide.empresaId === id), [guides, id]);

  const handleUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !empresa) return;

    const result = validatePDF(file);
    if (!result.valid) {
      toast.error('Arquivo invalido', { description: result.error });
      return;
    }

    const newDoc = {
      id: `doc-${Date.now()}`,
      empresaId: empresa.id,
      nome: file.name,
      categoria: 'outro' as const,
      dataUpload: new Date().toISOString().split('T')[0],
      responsavel: 'Admin',
      validade: null,
      observacao: '',
      versao: 1,
      tamanho: `${Math.round(file.size / 1024)} KB`,
      url: '#',
    };

    addDocumento(newDoc);
    addLog({
      id: `log-${Date.now()}`,
      empresaId: empresa.id,
      envioId: null,
      documentoId: newDoc.id,
      acao: 'envio',
      canal: null,
      usuario: 'Admin',
      destinatario: null,
      dataHora: new Date().toISOString(),
      detalhes: `Upload de ${file.name}`,
    });
    toast.success('Documento enviado', { description: file.name });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addDocumento, addLog, empresa]);

  if (!empresa) {
    return (
      <EmptyState
        icon={Building2}
        title="Empresa nao encontrada"
        description="Verifique o ID da empresa ou volte para a listagem."
        actionLabel="Voltar"
        onAction={() => navigate('/empresas')}
      />
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />

      <Button variant="ghost" size="sm" onClick={() => navigate('/empresas')} className="gap-1.5 -ml-2 text-foreground/72 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <GlassCard variant="elevated" className="overflow-hidden p-0">
        <div className="bg-gradient-to-r from-primary/5 via-transparent to-accent/5 p-6">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-lg font-bold text-primary">
                {empresa.nomeFantasia.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold tracking-tight">{empresa.nomeFantasia}</h1>
                  <StatusBadge status={empresa.status} variant="empresa" />
                </div>
                <p className="mt-0.5 text-sm text-foreground/72">{empresa.razaoSocial}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground/76">
                  <span className="rounded bg-muted/50 px-2 py-0.5 font-mono">{formatCNPJ(empresa.cnpj)}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{empresa.municipio}/{empresa.estado}</span>
                  <span>{getRegimeLabel(empresa.regimeTributario)}</span>
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{empresa.emailPrincipal}</span>
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{formatPhone(empresa.whatsappPrincipal)}</span>
                </div>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-border/50 bg-background/45 px-4 py-3">
                <p className="text-xl font-bold text-primary">{guias.length}</p>
                <p className="text-[10px] font-medium text-foreground/68">Guias</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/45 px-4 py-3">
                <p className="text-xl font-bold text-info">{docs.length}</p>
                <p className="text-[10px] font-medium text-foreground/68">Docs</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/45 px-4 py-3">
                <p className="text-xl font-bold text-success">{envios.length}</p>
                <p className="text-[10px] font-medium text-foreground/68">Envios</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-border/40 bg-muted/20 px-6 py-3">
          <div className="mr-auto flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 text-xs">
            Canal de guias: <span className="font-semibold capitalize">{empresa.canalPreferido || 'nao configurado'}</span>
            {empresa.canalPreferido === 'whatsapp' && !empresa.whatsappOptInAt && <span className="text-warning">sem opt-in</span>}
            {empresa.canalPreferido === 'email' && !empresa.emailValidado && <span className="text-warning">nao validado</span>}
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload PDF
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate('/envios')}>
            <Send className="h-3.5 w-3.5" /> Enviar Documentos
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info('Alerta manual', { description: 'Fluxo manual sera tratado na central de alertas.' })}>
            <Bell className="h-3.5 w-3.5" /> Gerar Alerta
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info('Edicao', { description: 'Funcionalidade em preparacao.' })}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      </GlassCard>

      {alertas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {alertas.map((alerta) => (
            <div
              key={alerta.id}
              className={cn('flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-card/80', !alerta.lido && 'border-l-3 border-l-warning')}
              onClick={() => { markAlertaLido(alerta.id); toast.info('Alerta marcado como lido'); }}
            >
              <StatusBadge status={alerta.prioridade} variant="prioridade" dot={false} className="text-[10px]" />
              <span className="font-medium">{alerta.titulo}</span>
            </div>
          ))}
        </div>
      )}

      <EmpresaAutomacaoCards empresaId={empresa.id} />

      <Tabs defaultValue="documentos" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto bg-muted/30 p-1">
          <TabsTrigger value="documentos" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText className="h-3.5 w-3.5" /> Documentos <span className="ml-1 text-[10px] text-foreground/68">({docs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="envios" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Send className="h-3.5 w-3.5" /> Envios <span className="ml-1 text-[10px] text-foreground/68">({envios.length})</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Clock className="h-3.5 w-3.5" /> Logs <span className="ml-1 text-[10px] text-foreground/68">({logs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="guias" className="gap-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText className="h-3.5 w-3.5" /> Guias <span className="ml-1 text-[10px] text-foreground/68">({guias.length})</span>
          </TabsTrigger>
          <TabsTrigger value="observacoes" className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Observacoes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="space-y-2">
          {docs.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhum documento" description="Faca upload de PDFs para esta empresa." actionLabel="Upload" onAction={() => fileInputRef.current?.click()} />
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="glass-card-subtle p-4 transition-all hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{doc.nome}</p>
                      <div className="flex gap-3 text-[11px] text-foreground/72">
                        <span>{getDocumentoCategoriaLabel(doc.categoria)}</span>
                        <span>v{doc.versao}</span>
                        <span>{doc.tamanho}</span>
                        <span>{formatDate(doc.dataUpload)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Abrir ${doc.nome}`} onClick={() => openDocument(doc)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Baixar ${doc.nome}`} onClick={() => openDocument(doc, 'download')}><Download className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="envios" className="space-y-2">
          {envios.length === 0 ? (
            <EmptyState icon={Send} title="Nenhum envio" description="Envie documentos para esta empresa." actionLabel="Novo Envio" onAction={() => navigate('/envios')} />
          ) : (
            envios.map((envio) => (
              <div key={envio.id} className="glass-card-subtle p-4 transition-all hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', envio.canal === 'email' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success')}>
                      {envio.canal === 'email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{envio.canal === 'email' ? envio.assunto || 'E-mail' : 'WhatsApp'}</p>
                      <div className="flex gap-3 text-[11px] text-foreground/72">
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
            <div className="relative ml-4 space-y-4 border-l-2 border-border/60 py-2">
              {logs.map((log) => (
                <div key={log.id} className="relative pl-6">
                  <div className={cn('absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 bg-background',
                    log.acao === 'envio' ? 'border-primary' : log.acao === 'download' ? 'border-success' : log.acao === 'visualizacao' ? 'border-info' : 'border-warning'
                  )} />
                  <div className="text-sm font-medium">{log.detalhes}</div>
                  <div className="mt-0.5 flex gap-3 text-[11px] text-foreground/72">
                    <span>{formatDateTime(log.dataHora)}</span>
                    <span>{log.usuario}</span>
                    {log.canal && <span className="capitalize">{log.canal}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="guias" className="space-y-2">
          {guias.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhuma guia processada" description="Guias identificadas pelo CNPJ desta empresa aparecerao aqui." />
          ) : guias.map((guia) => (
            <div key={guia.id} className="glass-card-subtle flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{guia.fileName}</p>
                <p className="mt-1 text-xs text-foreground/70">{guia.tipoGuia || 'Guia'} | {formatDateTime(guia.receivedAt)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate(`/guias/${guia.id}`)}>Abrir</Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="observacoes">
          <GlassCard>
            <SectionHeader title="Observacoes" />
            <p className="text-sm leading-relaxed">{empresa.observacoes || 'Nenhuma observacao registrada.'}</p>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
