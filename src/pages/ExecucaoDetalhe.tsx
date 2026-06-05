import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, FileText, Clock, RotateCcw, AlertTriangle, ExternalLink, Shield } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { ExecutionTimeline } from '@/components/ExecutionTimeline';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function ExecucaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAutomation();
  const { state: dataState } = useDataStore();
  const { toast } = useToast();

  const run = useMemo(() => state.runs.find(r => r.id === id), [state.runs, id]);
  const empresa = useMemo(() => run ? dataState.empresas.find(e => e.id === run.empresaId) : null, [run, dataState.empresas]);
  const connector = useMemo(() => run ? state.connectors.find(c => c.id === run.connectorId) : null, [run, state.connectors]);
  const cndItem = useMemo(() => run?.cndItemId ? dataState.cnds.find(c => c.id === run.cndItemId) : null, [run, dataState.cnds]);
  const relatedExceptions = useMemo(() => run ? state.exceptions.filter(e => e.runId === run.id) : [], [run, state.exceptions]);

  if (!run) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-foreground/72 mb-2">Execução não encontrada</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/execucoes')}>Voltar</Button>
        </div>
      </div>
    );
  }

  const tipoLabels: Record<string, string> = {
    receita_federal: 'Receita Federal', fgts: 'FGTS', sefaz: 'SEFAZ',
    municipal: 'Municipal', trabalhista: 'Trabalhista', personalizada: 'Personalizada',
  };

  const decisionExplanation = run.confianca === 'alta' && run.status === 'sucesso'
    ? { action: 'Publicação automática', reason: 'Score de confiança alto — todos os critérios atendidos. O resultado foi aplicado automaticamente ao checklist da empresa.', color: 'text-success' }
    : run.confianca === 'media'
    ? { action: 'Flagged para revisão', reason: 'Score de confiança médio — alguns critérios não foram completamente atendidos. O resultado precisa de revisão manual antes de ser publicado.', color: 'text-warning' }
    : run.status === 'falha' || run.status === 'timeout'
    ? { action: 'Exceção criada', reason: 'A execução falhou. Uma exceção foi criada na fila para triagem e ação manual.', color: 'text-destructive' }
    : { action: 'Enviado para exceção', reason: 'Score de confiança baixo — dados insuficientes ou ambíguos. O resultado não foi publicado automaticamente.', color: 'text-destructive' };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/execucoes')} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      {/* Header */}
      <div className="glass-card-elevated p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <RunStatusBadge status={run.status} />
              <ConfidenceBadge level={run.confianca} />
            </div>
            <h1 className="text-xl font-bold text-foreground">{empresa?.nomeFantasia || run.empresaId}</h1>
            <p className="text-sm text-foreground/68">{empresa?.cnpj} · {connector?.nome}</p>
            {cndItem && (
              <p className="text-sm text-foreground/72 mt-1">{tipoLabels[cndItem.tipo] || cndItem.tipo}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] text-foreground/68">
            <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Início: {new Date(run.inicioExecucao).toLocaleString('pt-BR')}</div>
            {run.fimExecucao && <div>Fim: {new Date(run.fimExecucao).toLocaleString('pt-BR')}</div>}
            {run.duracao && <div>Duração: {run.duracao.toFixed(1)}s</div>}
            <div>Tentativa: {run.tentativa}{state.retryPolicies[run.connectorId] ? `/${state.retryPolicies[run.connectorId].maxTentativas}` : ''}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => toast({ title: 'Reprocessando...' })}>
            <RotateCcw className="h-3.5 w-3.5" /> Reprocessar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => toast({ title: 'Exceção criada' })}>
            <AlertTriangle className="h-3.5 w-3.5" /> Criar Exceção
          </Button>
          {empresa && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => navigate(`/empresas/${empresa.id}`)}>
              <ExternalLink className="h-3.5 w-3.5" /> Ver Empresa
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Timeline */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Timeline da Execução</h2>
            {run.steps.length > 0 ? (
              <ExecutionTimeline steps={run.steps} />
            ) : (
              <p className="text-sm text-foreground/68 italic">Nenhuma etapa registrada (execução agendada)</p>
            )}
          </div>

          {/* Motor de Decisão */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-foreground/72" />
              <h2 className="section-title">Motor de Decisão</h2>
            </div>
            <div className={`p-3 rounded-lg bg-muted/50 border border-border/50`}>
              <p className={`text-sm font-semibold ${decisionExplanation.color} mb-1`}>
                {decisionExplanation.action}
              </p>
              <p className="text-[11px] text-foreground/72 leading-relaxed">
                {decisionExplanation.reason}
              </p>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Resultado */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-3">Resultado</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-start">
                <span className="text-foreground/68">Status bruto</span>
                <span className="font-mono text-[11px] text-foreground/70 bg-muted px-2 py-0.5 rounded max-w-[60%] text-right break-all">{run.resultadoBruto || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/68">Status normalizado</span>
                <span className="font-medium text-foreground">{run.statusNormalizado || '—'}</span>
              </div>
            </div>
          </div>

          {/* Confiança Breakdown */}
          <ConfidenceBreakdown confianca={run.confianca} />

          {/* Evidências */}
          {run.evidencias.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-3">Evidências</h2>
              <ul className="space-y-1.5">
                {run.evidencias.map((ev, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground/72">
                    <FileText className="h-3.5 w-3.5 text-foreground/35" />
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Erro */}
          {run.erroDetalhes && (
            <div className="glass-card border-destructive/20 border p-5">
              <h2 className="section-title mb-2 text-destructive">Detalhes do Erro</h2>
              <p className="text-sm text-foreground/70">{run.erroDetalhes}</p>
            </div>
          )}

          {/* Impacto */}
          {(relatedExceptions.length > 0 || (run.status === 'sucesso' && run.confianca === 'alta')) && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-3">Impacto</h2>
              <div className="space-y-1.5 text-[11px]">
                {run.status === 'sucesso' && run.confianca === 'alta' && cndItem && (
                  <p className="text-success">✓ CND atualizada automaticamente ({tipoLabels[cndItem.tipo] || cndItem.tipo})</p>
                )}
                {run.status === 'sucesso' && run.confianca === 'alta' && (
                  <p className="text-foreground/72">✓ Alerta de vencimento recalculado</p>
                )}
                {relatedExceptions.map(exc => (
                  <p key={exc.id} className="text-warning">⚠ Exceção criada: {exc.motivo}</p>
                ))}
              </div>
            </div>
          )}

          {/* Empresa */}
          {empresa && (
            <div className="glass-card p-5 cursor-pointer hover:border-primary/20 transition-all" onClick={() => navigate(`/empresas/${empresa.id}`)}>
              <h2 className="section-title mb-3">Empresa</h2>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{empresa.nomeFantasia}</p>
                  <p className="text-[11px] text-foreground/68">{empresa.razaoSocial}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
