import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, FileText, Clock } from 'lucide-react';
import { useAutomation } from '@/data/AutomationProvider';
import { useDataStore } from '@/data/DataProvider';
import { RunStatusBadge } from '@/components/RunStatusBadge';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { ExecutionTimeline } from '@/components/ExecutionTimeline';
import { Button } from '@/components/ui/button';

export default function ExecucaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAutomation();
  const { state: dataState } = useDataStore();

  const run = useMemo(() => state.runs.find(r => r.id === id), [state.runs, id]);
  const empresa = useMemo(() => run ? dataState.empresas.find(e => e.id === run.empresaId) : null, [run, dataState.empresas]);
  const connector = useMemo(() => run ? state.connectors.find(c => c.id === run.connectorId) : null, [run, state.connectors]);
  const cndItem = useMemo(() => run?.cndItemId ? dataState.cnds.find(c => c.id === run.cndItemId) : null, [run, dataState.cnds]);

  if (!run) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-foreground/60 mb-2">Execução não encontrada</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/execucoes')}>Voltar</Button>
        </div>
      </div>
    );
  }

  const tipoLabels: Record<string, string> = {
    receita_federal: 'Receita Federal', fgts: 'FGTS', sefaz: 'SEFAZ',
    municipal: 'Municipal', trabalhista: 'Trabalhista', personalizada: 'Personalizada',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/execucoes')} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      <div className="glass-card-elevated p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <RunStatusBadge status={run.status} />
              <ConfidenceBadge level={run.confianca} />
            </div>
            <h1 className="text-xl font-bold text-foreground">{empresa?.nomeFantasia || run.empresaId}</h1>
            <p className="text-sm text-foreground/50">{empresa?.cnpj} · {connector?.nome}</p>
            {cndItem && (
              <p className="text-sm text-foreground/60 mt-1">{tipoLabels[cndItem.tipo] || cndItem.tipo}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] text-foreground/50">
            <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Início: {new Date(run.inicioExecucao).toLocaleString('pt-BR')}</div>
            {run.fimExecucao && <div>Fim: {new Date(run.fimExecucao).toLocaleString('pt-BR')}</div>}
            {run.duracao && <div>Duração: {run.duracao.toFixed(1)}s</div>}
            <div>Tentativa: {run.tentativa}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h2 className="section-title mb-4">Timeline da Execução</h2>
          {run.steps.length > 0 ? (
            <ExecutionTimeline steps={run.steps} />
          ) : (
            <p className="text-sm text-foreground/50 italic">Nenhuma etapa registrada (execução agendada)</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <h2 className="section-title mb-3">Resultado</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-foreground/50">Status bruto</span>
                <span className="font-mono text-[11px] text-foreground/70 bg-muted px-2 py-0.5 rounded">{run.resultadoBruto || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground/50">Status normalizado</span>
                <span className="font-medium text-foreground">{run.statusNormalizado || '—'}</span>
              </div>
            </div>
          </div>

          {run.evidencias.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-3">Evidências</h2>
              <ul className="space-y-1.5">
                {run.evidencias.map((ev, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground/60">
                    <FileText className="h-3.5 w-3.5 text-foreground/35" />
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {run.erroDetalhes && (
            <div className="glass-card glass-card-critical p-5">
              <h2 className="section-title mb-2 text-destructive">Detalhes do Erro</h2>
              <p className="text-sm text-foreground/70">{run.erroDetalhes}</p>
            </div>
          )}

          {empresa && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-3">Empresa</h2>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{empresa.nomeFantasia}</p>
                  <p className="text-[11px] text-foreground/50">{empresa.razaoSocial}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
