import { useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Folder, FolderPlus, Upload, Send, ExternalLink, FileText, Loader2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Empresa { id: string; razao_social: string; cnpj: string; email_principal: string | null; drive_folder_id: string | null; saudacao_guia: string | null; }
interface Guia { id: string; file_name: string; drive_file_id: string; tipo_guia: string | null; valor: number | null; vencimento: string | null; competencia: string | null; status: string; sent_at: string | null; }
interface Envio { id: string; created_at: string; status: string; destinatario: string; provider_message_id: string | null; }

function fmtBRL(v: number | null) { return v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`; }
function fmtDate(iso: string | null) { return iso ? iso.split('-').reverse().join('/') : '—'; }

export function EmpresaAutomacaoCards({ empresaId }: { empresaId: string }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [ultimoEnvio, setUltimoEnvio] = useState<Envio | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dispatching, setDispatching] = useState<'simulate' | 'live' | null>(null);
  const [destinatario, setDestinatario] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const driveUrl = useMemo(() => empresa?.drive_folder_id ? `https://drive.google.com/drive/folders/${empresa.drive_folder_id}` : null, [empresa]);

  async function refresh() {
    const [{ data: e }, { data: g }, { data: env }] = await Promise.all([
      supabase.from('empresas').select('id, razao_social, cnpj, email_principal, drive_folder_id, saudacao_guia').eq('id', empresaId).single(),
      supabase.from('guias').select('id, file_name, drive_file_id, tipo_guia, valor, vencimento, competencia, status, sent_at').eq('empresa_id', empresaId).eq('pasta_atual', 'empresa').order('created_at', { ascending: false }),
      supabase.from('guia_envios').select('id, created_at, status, destinatario, provider_message_id').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (e) { setEmpresa(e as Empresa); if (!destinatario) setDestinatario(e.email_principal || ''); }
    setGuias((g || []) as Guia[]);
    setUltimoEnvio((env || null) as Envio | null);
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empresaId]);

  async function createFolder() {
    setCreatingFolder(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-empresa-folder', { body: { empresa_id: empresaId } });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error || error?.message);
      toast.success((data as any).reused ? 'Pasta já existia' : 'Pasta criada no Drive');
      await refresh();
    } catch (err: any) {
      toast.error('Falha ao criar pasta', { description: err.message });
    } finally { setCreatingFolder(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !empresa) return;
    if (!empresa.drive_folder_id) { toast.error('Crie a pasta no Drive primeiro'); return; }
    setUploading(true);
    try {
      for (const file of files) {
        if (file.type !== 'application/pdf') { toast.error(`${file.name} não é PDF`); continue; }
        const path = `${empresaId}/${crypto.randomUUID()}-${file.name}`;
        const up = await supabase.storage.from('empresa-documentos').upload(path, file, { contentType: 'application/pdf' });
        if (up.error) { toast.error(`Falha no upload: ${file.name}`, { description: up.error.message }); continue; }
        const { data, error } = await supabase.functions.invoke('upload-empresa-doc', { body: { empresa_id: empresaId, storage_path: path, file_name: file.name } });
        if (error || (data as any)?.error) { toast.error(`Drive falhou: ${file.name}`, { description: (data as any)?.details || error?.message }); continue; }
        toast.success(`Enviado: ${file.name}`);
      }
      await refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function dispatchGuias(mode: 'simulate' | 'live') {
    if (!guias.length) { toast.error('Nenhum PDF na pasta'); return; }
    if (!destinatario) { toast.error('Informe o destinatário'); return; }
    setDispatching(mode);
    try {
      const { data, error } = await supabase.functions.invoke('dispatch-empresa-guias', {
        body: { empresa_id: empresaId, mode, destinatario_override: destinatario },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.message || (data as any)?.details || (data as any)?.error || error?.message);
      if (mode === 'simulate') {
        toast.success('Simulação concluída', { description: `${(data as any).items?.length || 0} guia(s) prontas para ${destinatario}` });
      } else {
        toast.success('E-mail enviado', { description: `msg=${(data as any).provider_message_id}` });
      }
      await refresh();
    } catch (err: any) {
      toast.error('Falha no disparo', { description: err.message });
    } finally { setDispatching(null); }
  }

  if (!empresa) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleUpload} />

      {/* Card 1: Drive folder */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Folder className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Pasta no Drive</h3>
            <p className="text-[11px] text-foreground/55">Diretório dedicado da empresa</p>
          </div>
        </div>
        {empresa.drive_folder_id ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-success"><CheckCircle2 className="h-3 w-3" /> Pasta configurada</div>
            <p className="text-[10px] font-mono text-foreground/55 truncate" title={empresa.drive_folder_id}>{empresa.drive_folder_id}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs gap-1.5" asChild>
                <a href={driveUrl!} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Abrir</a>
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={createFolder} disabled={creatingFolder}>
                {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Recriar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] text-warning"><AlertCircle className="h-3 w-3" /> Nenhuma pasta criada</div>
            <Button size="sm" className="w-full gap-1.5 text-xs" onClick={createFolder} disabled={creatingFolder}>
              {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3" />}
              Criar pasta no Drive
            </Button>
          </div>
        )}
      </GlassCard>

      {/* Card 2: Upload PDFs */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><Upload className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Documentos da pasta</h3>
            <p className="text-[11px] text-foreground/55">{guias.length} PDF(s) carregado(s)</p>
          </div>
        </div>
        <Button size="sm" className="w-full gap-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading || !empresa.drive_folder_id}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Adicionar PDFs
        </Button>
        <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
          {guias.length === 0 ? (
            <p className="text-[11px] text-foreground/45 text-center py-2">Nenhum documento</p>
          ) : guias.map(g => (
            <div key={g.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1.5">
              <FileText className="h-3 w-3 text-foreground/60 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium truncate">{g.file_name}</p>
                <p className="text-[10px] text-foreground/55">
                  {g.tipo_guia || 'Aguardando análise'}
                  {g.valor != null && ` • ${fmtBRL(g.valor)}`}
                  {g.vencimento && ` • venc. ${fmtDate(g.vencimento)}`}
                </p>
              </div>
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded',
                g.status === 'enviada' ? 'bg-success/15 text-success' :
                g.status === 'identificada' ? 'bg-info/15 text-info' : 'bg-muted text-foreground/60')}>{g.status}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Card 3: Dispatch */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success"><Send className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Disparar guias</h3>
            <p className="text-[11px] text-foreground/55">Envia todos os PDFs por e-mail</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] text-foreground/60 uppercase tracking-wide">Destinatário</label>
          <Input value={destinatario} onChange={(e) => setDestinatario(e.target.value)} placeholder="email@exemplo.com" className="h-8 text-xs" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 text-xs gap-1.5" onClick={() => dispatchGuias('simulate')} disabled={!!dispatching || !guias.length}>
            {dispatching === 'simulate' ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Simular
          </Button>
          <Button size="sm" className="flex-1 text-xs gap-1.5" onClick={() => dispatchGuias('live')} disabled={!!dispatching || !guias.length}>
            {dispatching === 'live' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Enviar
          </Button>
        </div>
        {ultimoEnvio && (
          <div className="text-[10px] text-foreground/55 border-t border-border/30 pt-2 space-y-0.5">
            <p>Último envio: {new Date(ultimoEnvio.created_at).toLocaleString('pt-BR')}</p>
            <p>Para: {ultimoEnvio.destinatario}</p>
            {ultimoEnvio.provider_message_id && <p className="font-mono truncate">msg: {ultimoEnvio.provider_message_id}</p>}
          </div>
        )}
      </GlassCard>
    </div>
  );
}