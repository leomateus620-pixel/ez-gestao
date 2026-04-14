import { useState } from 'react';
import { CheckCircle2, XCircle, Shield, ShieldQuestion, ShieldAlert } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { ExceptionItem, ConfidenceLevel } from '@/data/automation-types';

interface ReviewField {
  label: string;
  extracted: string;
  expected: string;
  confianca: ConfidenceLevel;
  approved: boolean | null;
}

interface ReviewPanelProps {
  exception: ExceptionItem | null;
  open: boolean;
  onClose: () => void;
  onPublish: (exceptionId: string) => void;
}

function getReviewFields(exc: ExceptionItem): ReviewField[] {
  return [
    { label: 'CNPJ', extracted: exc.cnpj, expected: exc.cnpj, confianca: 'alta', approved: null },
    { label: 'Tipo de Certidão', extracted: exc.cndTipo, expected: exc.cndTipo, confianca: 'alta', approved: null },
    { label: 'Conector', extracted: exc.connectorNome, expected: exc.connectorNome, confianca: 'alta', approved: null },
    { label: 'Data de Validade', extracted: '15/05/2025', expected: '—', confianca: exc.tipologia === 'validade_ambigua' ? 'baixa' : 'media', approved: null },
    { label: 'Nº Certidão', extracted: 'CND-2024-00891', expected: '—', confianca: 'media', approved: null },
    { label: 'Status', extracted: 'Negativa', expected: 'Negativa', confianca: exc.tipologia === 'baixa_confianca' ? 'baixa' : 'alta', approved: null },
  ];
}

const confiancaIcons = {
  alta: { icon: Shield, color: 'text-success' },
  media: { icon: ShieldQuestion, color: 'text-warning' },
  baixa: { icon: ShieldAlert, color: 'text-destructive' },
};

export function ReviewPanel({ exception, open, onClose, onPublish }: ReviewPanelProps) {
  const [fields, setFields] = useState<ReviewField[]>([]);

  const handleOpen = () => {
    if (exception) setFields(getReviewFields(exception));
  };

  const toggleApproval = (index: number, value: boolean) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, approved: value } : f));
  };

  const allReviewed = fields.every(f => f.approved !== null);
  const allApproved = fields.every(f => f.approved === true);

  if (!exception) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); else handleOpen(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Revisão Assistida</SheetTitle>
          <SheetDescription className="text-xs">
            Compare os dados extraídos e aprove campo a campo
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-1">
          <div className="grid grid-cols-[1fr_1fr_1fr_80px] gap-2 text-[10px] font-semibold text-foreground/50 uppercase tracking-wider pb-2 border-b border-border">
            <span>Campo</span>
            <span>Extraído</span>
            <span>Esperado</span>
            <span className="text-center">Ação</span>
          </div>

          {fields.map((field, i) => {
            const ci = confiancaIcons[field.confianca];
            const CIcon = ci.icon;
            const isDivergent = field.extracted !== field.expected && field.expected !== '—';

            return (
              <div key={i} className={`grid grid-cols-[1fr_1fr_1fr_80px] gap-2 items-center py-2.5 border-b border-border/50 ${isDivergent ? 'bg-destructive/5 -mx-2 px-2 rounded' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <CIcon className={`h-3 w-3 ${ci.color} shrink-0`} />
                  <span className="text-xs font-medium text-foreground">{field.label}</span>
                </div>
                <span className="text-xs text-foreground/70 font-mono truncate">{field.extracted}</span>
                <span className="text-xs text-foreground/50 truncate">{field.expected}</span>
                <div className="flex items-center justify-center gap-1">
                  <Button
                    variant={field.approved === true ? 'default' : 'ghost'}
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleApproval(i, true)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={field.approved === false ? 'destructive' : 'ghost'}
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleApproval(i, false)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/50">
              {fields.filter(f => f.approved === true).length}/{fields.length} campos aprovados
            </span>
            {allReviewed && (
              <span className={allApproved ? 'text-success font-medium' : 'text-warning font-medium'}>
                {allApproved ? 'Todos aprovados' : 'Campos rejeitados'}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!allReviewed}
              onClick={() => onPublish(exception.id)}
            >
              Publicar Revisado
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
