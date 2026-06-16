/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useEffect } from 'react';
import { Mail, MessageCircle, Plus } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuideTemplates } from '@/features/guias/useGuideOps';

const TIPOS = ['das', 'fgts', 'daf', 'darf', 'gps_inss', 'iss', 'icms', 'outros'] as const;
const CANAIS = ['email', 'whatsapp'] as const;
const VARS = '{{empresa}} {{competencia}} {{vencimento}} {{valor}} {{codigo_barras}} {{linha_digitavel}}';

function renderPreview(text: string) {
  return text
    .replace(/\{\{empresa\}\}/g, 'EMPRESA EXEMPLO LTDA')
    .replace(/\{\{competencia\}\}/g, '06/2026')
    .replace(/\{\{vencimento\}\}/g, '20/07/2026')
    .replace(/\{\{valor\}\}/g, 'R$ 1.234,56')
    .replace(/\{\{codigo_barras\}\}/g, '00190000090123456789012345678901234567890123')
    .replace(/\{\{linha_digitavel\}\}/g, '00190 00009 01234 567890 12345 678901 2 34567890123');
}

export default function TemplatesGuias() {
  const { data = [], upsert } = useGuideTemplates();
  const [tipo, setTipo] = useState<string>('das');
  const [canal, setCanal] = useState<'email' | 'whatsapp'>('email');
  const current = useMemo(() => (data as any[]).find((t) => t.tipo_guia === tipo && t.canal === canal), [data, tipo, canal]);
  const [draft, setDraft] = useState<any>({ assunto: '', corpo: '', twilio_content_sid: '', ativo: true });

  useEffect(() => {
    setDraft({
      assunto: current?.assunto ?? '',
      corpo: current?.corpo ?? '',
      twilio_content_sid: current?.twilio_content_sid ?? '',
      ativo: current?.ativo ?? true,
    });
  }, [current?.id, tipo, canal]);

  const save = () => upsert.mutate({
    id: current?.id,
    tipo_guia: tipo,
    canal,
    assunto: draft.assunto,
    corpo: draft.corpo,
    twilio_content_sid: draft.twilio_content_sid || null,
    ativo: draft.ativo,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">Canal</Label>
          <div className="flex gap-1">
            {CANAIS.map((c) => (
              <Button key={c} size="sm" variant={canal === c ? 'default' : 'outline'} onClick={() => setCanal(c)}>
                {c === 'email' ? <Mail className="mr-1 h-3.5 w-3.5" /> : <MessageCircle className="mr-1 h-3.5 w-3.5" />}
                {c}
              </Button>
            ))}
          </div>
        </div>
        <Badge variant="outline">{current ? `Editando (${current.id.slice(0, 8)})` : 'Novo template'}</Badge>
      </div>

      <p className="text-[11px] text-foreground/64">Variáveis disponíveis: <code className="rounded bg-muted px-1.5 py-0.5">{VARS}</code></p>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard variant="elevated" className="space-y-3 p-4">
          {canal === 'email' && (
            <div>
              <Label className="text-xs">Assunto do e-mail</Label>
              <Input value={draft.assunto} onChange={(e) => setDraft({ ...draft, assunto: e.target.value })} />
            </div>
          )}
          <div>
            <Label className="text-xs">{canal === 'email' ? 'Corpo do e-mail' : 'Mensagem WhatsApp (fallback)'}</Label>
            <Textarea value={draft.corpo} onChange={(e) => setDraft({ ...draft, corpo: e.target.value })} className="h-48 font-mono text-xs" />
          </div>
          {canal === 'whatsapp' && (
            <div>
              <Label className="text-xs">Twilio Content SID (template aprovado)</Label>
              <Input value={draft.twilio_content_sid} placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" onChange={(e) => setDraft({ ...draft, twilio_content_sid: e.target.value })} />
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={!!draft.ativo} onCheckedChange={(v) => setDraft({ ...draft, ativo: v })} />
              <span className="text-xs">Ativo</span>
            </div>
            <Button size="sm" onClick={save} disabled={upsert.isPending}><Plus className="mr-1 h-3.5 w-3.5" /> Salvar</Button>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-foreground/60">Preview com dados de exemplo</p>
          {canal === 'email' && draft.assunto && (
            <p className="mb-3 text-sm font-semibold">Assunto: {renderPreview(draft.assunto)}</p>
          )}
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-xs">{renderPreview(draft.corpo || '(vazio)')}</pre>
        </GlassCard>
      </div>
    </div>
  );
}