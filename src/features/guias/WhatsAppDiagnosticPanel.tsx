import { useMemo, useState } from 'react';
import { Activity, MessageCircle, Send, ShieldAlert } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSendWhatsAppTest, useWhatsAppDiagnostic } from '@/features/guias/useGuideOps';

type TemplateInfo = { name: string; language: string; category?: string };

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? 'default' : 'destructive'} className="capitalize">
      {ok ? 'OK' : 'Erro'} • {label}
    </Badge>
  );
}

export function WhatsAppDiagnosticPanel() {
  const diag = useWhatsAppDiagnostic();
  const send = useSendWhatsAppTest();

  const [to, setTo] = useState('');
  const [tplName, setTplName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [paramsRaw, setParamsRaw] = useState('');

  const data: any = diag.data;
  const wa = data?.whatsapp ?? null;
  const secrets = wa?.secrets ?? null;
  const wabaInfo = wa?.waba ?? null;
  const phoneInfo = wa?.phone ?? null;
  const templates: TemplateInfo[] = useMemo(
    () => (Array.isArray(wabaInfo?.templates_active) ? wabaInfo.templates_active : []),
    [wabaInfo],
  );

  const handleSend = () => {
    const parameters = paramsRaw
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    send.mutate({ to, template_name: tplName, language, parameters });
  };

  return (
    <GlassCard variant="elevated" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Diagnóstico WhatsApp (admin)</p>
            <p className="text-xs text-foreground/68">
              Verifica secrets, WABA/templates e Phone Number ID na Meta Cloud API. Não expõe tokens.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => diag.mutate()} disabled={diag.isPending}>
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          {diag.isPending ? 'Executando…' : 'Diagnosticar WhatsApp'}
        </Button>
      </div>

      {wa && (
        <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs">
          {secrets && (
            <div className="flex flex-wrap gap-2">
              <StatusPill ok={secrets.access_token === 'present'} label="ACCESS_TOKEN" />
              <StatusPill ok={secrets.phone_number_id === 'present'} label="PHONE_NUMBER_ID" />
              <StatusPill ok={secrets.waba_id === 'present'} label="BUSINESS_ACCOUNT_ID" />
              <StatusPill ok={secrets.api_version === 'present'} label={`API ${wa.api_version}`} />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="font-semibold">WABA / Templates</p>
              {wabaInfo?.ok ? (
                <>
                  <p>Status: <span className="font-mono">{wabaInfo.token_scope}</span></p>
                  <p>Templates: <span className="font-mono">{wabaInfo.templates_count}</span></p>
                </>
              ) : (
                <p className="text-destructive flex items-start gap-1">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>code {wabaInfo?.error_code ?? '—'}: {wabaInfo?.error_message ?? 'erro desconhecido'}</span>
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Phone Number</p>
              {phoneInfo?.ok ? (
                <>
                  <p>Número: <span className="font-mono">{phoneInfo.display_phone_number || '—'}</span></p>
                  <p>Verified name: <span className="font-mono">{phoneInfo.verified_name || '—'}</span></p>
                  <p>Qualidade: <span className="font-mono">{phoneInfo.quality_rating || '—'}</span></p>
                </>
              ) : (
                <p className="text-destructive flex items-start gap-1">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>code {phoneInfo?.error_code ?? '—'}: {phoneInfo?.error_message ?? 'erro desconhecido'}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-border/50 p-3">
        <p className="text-sm font-semibold">Testar envio WhatsApp</p>
        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-foreground/68">Destino (E.164)</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="5555999999999" className="text-xs" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-foreground/68">Template</Label>
            {templates.length > 0 ? (
              <select
                value={tplName}
                onChange={(e) => {
                  const found = templates.find((t) => t.name === e.target.value);
                  setTplName(e.target.value);
                  if (found?.language) setLanguage(found.language);
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Selecione um template aprovado…</option>
                {templates.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            ) : (
              <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="nome_do_template" className="text-xs" />
            )}
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-foreground/68">Language</Label>
            <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="pt_BR" className="text-xs" />
          </div>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-foreground/68">
            Parâmetros do corpo (separados por <code>|</code>)
          </Label>
          <Input value={paramsRaw} onChange={(e) => setParamsRaw(e.target.value)} placeholder="EZ Contabilidade | DAS | 10/2025 | R$ 1.234,56" className="text-xs" />
        </div>
        <Button size="sm" onClick={handleSend} disabled={send.isPending || !to || !tplName}>
          <Send className="mr-1.5 h-3.5 w-3.5" />
          {send.isPending ? 'Enviando…' : 'Enviar teste'}
        </Button>
        {send.data?.message_id && (
          <p className="text-[11px] text-foreground/72">Message ID retornado pela Meta: <span className="font-mono">{send.data.message_id}</span></p>
        )}
      </div>
    </GlassCard>
  );
}