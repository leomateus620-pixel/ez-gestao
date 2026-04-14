import { AlertTriangle, RotateCcw, FileUp, XCircle, CheckCircle2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExceptionItem } from '@/data/automation-types';

interface ExceptionCardProps {
  exception: ExceptionItem;
  empresaNome?: string;
  connectorNome?: string;
  onResolve?: () => void;
  onRequeue?: () => void;
  onDiscard?: () => void;
  onClick?: () => void;
}

const criticidadeConfig: Record<string, { color: string; bg: string }> = {
  critica: { color: 'text-destructive', bg: 'border-l-destructive' },
  alta: { color: 'text-warning', bg: 'border-l-warning' },
  media: { color: 'text-info', bg: 'border-l-info' },
  baixa: { color: 'text-muted-foreground', bg: 'border-l-muted-foreground' },
};

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  em_analise: 'Em Análise',
  resolvida: 'Resolvida',
  descartada: 'Descartada',
};

export function ExceptionCard({ exception, empresaNome, connectorNome, onResolve, onRequeue, onDiscard, onClick }: ExceptionCardProps) {
  const crit = criticidadeConfig[exception.criticidade] || criticidadeConfig.media;
  const isActive = exception.statusExcecao === 'pendente' || exception.statusExcecao === 'em_analise';

  return (
    <div
      className={`glass-card border-l-[3px] ${crit.bg} p-4 cursor-pointer hover:border-primary/20 transition-all`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${crit.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${crit.color}`}>
            {exception.criticidade}
          </span>
          <span className="text-[10px] text-foreground/40">·</span>
          <span className="text-[10px] text-foreground/40">{statusLabels[exception.statusExcecao]}</span>
        </div>
        <span className="text-[10px] text-foreground/35">
          {new Date(exception.criadoEm).toLocaleDateString('pt-BR')}
        </span>
      </div>

      <p className="text-sm font-medium text-foreground mb-1">{exception.motivo}</p>

      <div className="flex items-center gap-3 text-[11px] text-foreground/50 mb-3">
        {empresaNome && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {empresaNome}
          </span>
        )}
        {connectorNome && <span>via {connectorNome}</span>}
      </div>

      <p className="text-[11px] text-foreground/40 mb-3 italic">{exception.acaoSugerida}</p>

      {isActive && (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {onResolve && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onResolve}>
              <CheckCircle2 className="h-3 w-3" /> Resolver
            </Button>
          )}
          {onRequeue && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onRequeue}>
              <RotateCcw className="h-3 w-3" /> Reenfileirar
            </Button>
          )}
          {onDiscard && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-muted-foreground" onClick={onDiscard}>
              <XCircle className="h-3 w-3" /> Descartar
            </Button>
          )}
        </div>
      )}

      {exception.resolvidoPor && (
        <p className="text-[10px] text-foreground/35 mt-2">
          Resolvido por {exception.resolvidoPor} em {exception.resolvidoEm ? new Date(exception.resolvidoEm).toLocaleDateString('pt-BR') : ''}
        </p>
      )}
    </div>
  );
}
