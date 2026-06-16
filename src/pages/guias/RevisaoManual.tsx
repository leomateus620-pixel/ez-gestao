/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useDispatchGuide, pdfPreviewUrl } from '@/features/guias/useGuideOps';
import { formatCNPJ } from '@/lib/formatters';

const db = supabase as any;
const TIPOS = ['das', 'fgts', 'daf', 'darf', 'gps_inss', 'iss', 'icms', 'outros'] as const;

function useReviewGuides() {
  return useQuery({
    queryKey: ['guias_revisao'],
    queryFn: async () => {
      const { data, error } = await db.from('guias')
        .select('*')
        .in('status', ['revisao', 'nao_identificada', 'duplicada', 'erro'])
        .order('received_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 10_000,
  });
}

function useEmpresas() {
  return useQuery({
    queryKey: ['empresas_simples'],
    queryFn: async () => {
      const { data, error } = await db.from('empresas').select('id, razao_social, cnpj, status, email_principal, whatsapp_principal').order('razao_social');
      if (error) throw error;
      return data || [];
    },
  });
}

async function getSessionToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

function PdfPreview({ guideId }: { guideId: string }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    let revoked = '';
    (async () => {
      const token = await getSessionToken();
      const res = await fetch(pdfPreviewUrl(guideId), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setUrl(''); return; }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      revoked = blobUrl;
      setUrl(blobUrl);
    })();
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [guideId]);
  if (!url) return <div className="flex h-[60vh] items-center justify-center text-xs text-foreground/60">Carregando PDF...</div>;
  return <iframe src={url} title="PDF da guia" className="h-[70vh] w-full rounded-xl border border-border/40" />;
}

export default function RevisaoManual() {
  const { data: guides = [], isLoading, refetch } = useReviewGuides();
  const { data: empresas = [] } = useEmpresas();
  const dispatch = useDispatchGuide();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => guides.find((g: any) => g.id === selectedId) || guides[0], [guides, selectedId]);

  const [form, setForm] = useState<any>({});
  useEffect(() => {
    if (selected) {
      setForm({
        empresa_id: selected.empresa_id ?? '',
        tipo_guia_normalized: selected.tipo_guia_normalized ?? 'outros',
        competencia: selected.competencia ?? '',
        vencimento: selected.vencimento ?? '',
        valor: selected.valor ?? '',
        cnpj_detectado: selected.cnpj_detectado ?? '',
      });
    }
  }, [selected?.id]);

  if (isLoading) return <div className="p-6 text-sm text-foreground/68">Carregando guias para revisão...</div>;

  if (!guides.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Revisão manual" subtitle="Nenhuma guia precisa de revisão no momento.">
          <Button asChild variant="outline"><Link to="/guias"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
        </PageHeader>
        <EmptyState icon={ShieldAlert} title="Fila vazia" description="Tudo que entra na pasta A Enviar e fica com baixa confiança aparece aqui." />
      </div>
    );
  }

  const submit = async (mode: 'approve_send' | 'approve_no_send' | 'mark_error' | 'reprocess') => {
    if (!selected) return;
    const overrides: Record<string, unknown> = {
      empresa_id: form.empresa_id || null,
      tipo_guia_normalized: form.tipo_guia_normalized,
      tipo_guia: (form.tipo_guia_normalized || 'outros').toUpperCase(),
      competencia: form.competencia || null,
      vencimento: form.vencimento || null,
      valor: form.valor === '' ? null : Number(form.valor),
      cnpj_detectado: form.cnpj_detectado || null,
    };
    if (mode === 'mark_error') {
      await db.from('guias').update({ status: 'erro', provider_error: 'Marcado como erro pela revisão.' }).eq('id', selected.id);
      await db.from('guide_audit').insert({ guia_id: selected.id, action: 'mark_error', actor: 'manual', before: selected, after: { status: 'erro' } });
      refetch();
      return;
    }
    if (mode === 'approve_no_send') {
      await db.from('guias').update({ ...overrides, status: 'enviada', sent_at: new Date().toISOString() }).eq('id', selected.id);
      await db.from('guide_audit').insert({ guia_id: selected.id, action: 'approve_no_send', actor: 'manual', before: selected, after: overrides });
      refetch();
      return;
    }
    // approve_send ou reprocess → dispatch
    await dispatch.mutateAsync({ guide_id: selected.id, overrides });
    refetch();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Revisão manual de guias" subtitle="Confirme empresa, tipo e valores antes de aprovar o envio.">
        <Button asChild variant="outline"><Link to="/guias"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link></Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_360px]">
        {/* lista */}
        <GlassCard className="max-h-[80vh] overflow-y-auto p-2">
          {guides.map((g: any) => (
            <button
              key={g.id}
              onClick={() => setSelectedId(g.id)}
              className={`block w-full rounded-lg p-3 text-left text-xs transition ${selected?.id === g.id ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
            >
              <p className="line-clamp-1 font-medium">{g.file_name}</p>
              <p className="mt-1 text-foreground/64">{g.cnpj_detectado ? formatCNPJ(g.cnpj_detectado) : 'sem CNPJ'} • {g.tipo_guia || '—'}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{g.status}</Badge>
                {g.confidence_score != null && <span className="text-[10px] text-foreground/60">conf {Math.round(g.confidence_score * 100)}%</span>}
              </div>
            </button>
          ))}
        </GlassCard>

        {/* preview */}
        <GlassCard variant="elevated" className="p-3">
          {selected ? <PdfPreview guideId={selected.id} /> : <div className="p-6 text-sm">Selecione uma guia.</div>}
        </GlassCard>

        {/* form */}
        {selected && (
          <GlassCard variant="elevated" className="space-y-3 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/60">Arquivo</p>
              <p className="text-sm font-medium">{selected.file_name}</p>
              <p className="mt-1 text-xs text-foreground/60">
                Confiança {Math.round((selected.confidence_score ?? 0) * 100)}% • valor extraído: {selected.valor_extraido_raw || '—'}
              </p>
              {selected.razao_social_detectada && (
                <p className="mt-1 text-xs text-foreground/60">Razão social detectada: {selected.razao_social_detectada}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Empresa</Label>
              <Select value={form.empresa_id || ''} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.razao_social} — {formatCNPJ(e.cnpj)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.tipo_guia_normalized} onValueChange={(v) => setForm({ ...form, tipo_guia_normalized: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">CNPJ</Label>
                <Input value={form.cnpj_detectado} onChange={(e) => setForm({ ...form, cnpj_detectado: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Competência (MM/AAAA)</Label>
                <Input value={form.competencia ?? ''} onChange={(e) => setForm({ ...form, competencia: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input type="date" value={form.vencimento ?? ''} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Valor</Label>
                <Input type="number" step="0.01" value={form.valor ?? ''} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
            </div>

            <Textarea readOnly value={selected.texto_extraido_preview || ''} className="h-24 text-[11px]" />

            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={() => submit('approve_send')} disabled={dispatch.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar e enviar
              </Button>
              <Button size="sm" variant="outline" onClick={() => submit('approve_no_send')}>
                Aprovar sem enviar
              </Button>
              <Button size="sm" variant="outline" onClick={() => submit('reprocess')} disabled={dispatch.isPending}>
                <RefreshCw className="mr-1 h-4 w-4" /> Reprocessar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => submit('mark_error')}>
                <XCircle className="mr-1 h-4 w-4" /> Marcar erro
              </Button>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}