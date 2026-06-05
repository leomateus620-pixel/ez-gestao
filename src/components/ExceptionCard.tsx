import { AlertTriangle, RotateCcw, XCircle, CheckCircle2, Building2, Clock, MoreHorizontal, Upload, Eye, UserPlus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ExceptionItem } from '@/data/automation-types';
import { tipologiaLabels } from '@/data/automation-types';

interface ExceptionCardProps {
  exception: ExceptionItem;
  onResolve?: () => void;
  onRequeue?: () => void;
  onDiscard?: () => void;
  onAssign?: () => void;
  onClick?: () => void;
}

const criticidadeConfig: Record<string, { color: string; bg: string; border: string }> = {
  critica: { color: 'text-destructive', bg: 'bg-destructive/8', border: 'border-l-destructive' },
  alta: { color: 'text-warning', bg: 'bg-warning/8', border: 'border-l-warning' },
  media: { color: 'text-info', bg: 'bg-info/8', border: 'border-l-info' },
  baixa: { color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-l-muted-foreground' },
};

const statusLabels: Record<string, string> = {
  pendente: 'Pendente',
  em_analise: 'Em Análise',
  resolvida: 'Resolvida',
  descartada: 'Descartada',
};

function getSlaRemaining(criadoEm: string, slaHoras: number): { text: string; expired: boolean } {
  const created = new Date(criadoEm).getTime();
  const deadline = created + slaHoras * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { text: 'SLA expirado', expired: true };
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 24) return { text: `${Math.floor(hours / 24)}d ${hours % 24}h`, expired: false };
  return { text: `${hours}h ${mins}m`, expired: false };
}

export function ExceptionCard({ exception, onResolve, onRequeue, onDiscard, onAssign, onClick }: ExceptionCardProps) {
  const crit = criticidadeConfig[exception.criticidade] || criticidadeConfig.media;
  const isActive = exception.statusExcecao === 'pendente' || exception.statusExcecao === 'em_analise';
  const sla = getSlaRemaining(exception.criadoEm, exception.slaHoras);

  return (
    <div
      className={`glass-card border-l-[3px] ${crit.border} p-4 cursor-pointer hover:border-primary/20 transition-all`}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className={`h-3.5 w-3.5 ${crit.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${crit.color}`}>
            {exception.criticidade}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${crit.bg} ${crit.color} font-medium`}>
            {tipologiaLabels[exception.tipologia]}
          </span>
          <span className="text-[10px] text-foreground/40">·</span>
          <span className="text-[10px] text-foreground/40">{statusLabels[exception.statusExcecao]}</span>
        </div>

        {isActive && (
          <div onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onResolve && (
                  <DropdownMenuItem onClick={onResolve} className="text-xs gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                  </DropdownMenuItem>
                )}
                {onRequeue && (
                  <DropdownMenuItem onClick={onRequeue} className="text-xs gap-2">
                    <RotateCcw className="h-3.5 w-3.5" /> Reenfileirar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-xs gap-2">
                  <Upload className="h-3.5 w-3.5" /> Upload Manual
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2">
                  <Eye className="h-3.5 w-3.5" /> Aprovar Leitura
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Reprocessar Parsing
                </DropdownMenuItem>
                {onAssign && (
                  <DropdownMenuItem onClick={onAssign} className="text-xs gap-2">
                    <UserPlus className="h-3.5 w-3.5" /> Escalar
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {onDiscard && (
                  <DropdownMenuItem onClick={onDiscard} className="text-xs gap-2 text-muted-foreground">
                    <XCircle className="h-3.5 w-3.5" /> Descartar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Motivo */}
      <p className="text-sm font-medium text-foreground mb-2 leading-snug">{exception.motivo}</p>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] mb-3">
        <div className="flex items-center gap-1.5 text-foreground/55">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{exception.cnpj}</span>
        </div>
        <div className="text-foreground/55">
          CND: <span className="font-medium text-foreground/70">{exception.cndTipo}</span>
        </div>
        <div className="text-foreground/55">
          Via: <span className="font-medium text-foreground/70">{exception.connectorNome}</span>
        </div>
        <div className="text-foreground/55">
          Tentativas: <span className="font-medium text-foreground/70">{exception.tentativas}</span>
        </div>
      </div>

      {/* SLA + date + responsavel */}
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 ${sla.expired ? 'text-destructive font-semibold' : 'text-foreground/40'}`}>
            <Clock className="h-3 w-3" />
            {sla.text}
          </span>
          <span className="text-foreground/35">
            {new Date(exception.criadoEm).toLocaleDateString('pt-BR')} {new Date(exception.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {exception.responsavel && (
          <span className="text-foreground/50 font-medium">{exception.responsavel}</span>
        )}
      </div>

      {/* Sugestão */}
      <p className="text-[10px] text-foreground/35 mt-2 italic leading-relaxed">{exception.acaoSugerida}</p>

      {/* Resolvido */}
      {exception.resolvidoPor && (
        <p className="text-[10px] text-foreground/35 mt-1.5">
          Resolvido por <span className="font-medium">{exception.resolvidoPor}</span> em {exception.resolvidoEm ? new Date(exception.resolvidoEm).toLocaleDateString('pt-BR') : ''}
        </p>
      )}
    </div>
  );
}
