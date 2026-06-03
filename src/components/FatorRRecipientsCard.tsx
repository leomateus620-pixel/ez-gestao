import { useEffect, useState } from 'react';
import { Mail, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GlassCard } from '@/components/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  responsible_email: string | null;
  secondary_emails: string[] | null;
  active: boolean;
};

type SyncConfig = {
  id?: string;
  email_alerts_enabled?: boolean;
  sync_enabled?: boolean;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function EmailChips({ emails, onChange }: { emails: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) { toast.error('E-mail inválido.'); return; }
    if (emails.includes(trimmed)) { setDraft(''); return; }
    onChange([...emails, trimmed]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {emails.map((email) => (
        <span key={email} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-xs text-foreground">
          {email}
          <button type="button" onClick={() => onChange(emails.filter((e) => e !== email))} className="text-foreground/60 hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="email@exemplo.com"
          className="h-8 w-56 text-xs"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-8 px-2"><Plus className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function CompanyRow({ company, onSaved }: { company: Company; onSaved: () => void }) {
  const [primary, setPrimary] = useState(company.responsible_email ?? '');
  const [secondary, setSecondary] = useState<string[]>(company.secondary_emails ?? []);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (primary && !isValidEmail(primary)) { toast.error('E-mail principal inválido.'); return; }
    setSaving(true);
    const { error } = await (supabase as any).from('fator_r_companies').update({
      responsible_email: primary.trim() || null,
      secondary_emails: secondary,
    }).eq('id', company.id);
    setSaving(false);
    if (error) { toast.error('Falha ao salvar destinatários.'); return; }
    toast.success(`Destinatários salvos para ${company.name}.`);
    onSaved();
  };

  const totalEmails = (primary ? 1 : 0) + secondary.length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{company.name}</div>
          <div className="text-xs text-foreground/70">{company.cnpj || 'CNPJ não informado'}</div>
        </div>
        <div className="flex items-center gap-2">
          {totalEmails === 0 ? (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Sem destinatário</Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{totalEmails} e-mail(s)</Badge>
          )}
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-wide text-foreground/70 font-medium">E-mail principal</label>
          <Input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="responsavel@empresa.com" className="h-9 mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-foreground/70 font-medium">E-mails adicionais (cópia)</label>
          <div className="mt-1">
            <EmailChips emails={secondary} onChange={setSecondary} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FatorRRecipientsCard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [togglingAlerts, setTogglingAlerts] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, cfg] = await Promise.all([
      (supabase as any).from('fator_r_companies').select('id,name,cnpj,responsible_email,secondary_emails,active').order('name', { ascending: true }),
      (supabase as any).from('fator_r_sync_config').select('*').limit(1).maybeSingle(),
    ]);
    setCompanies((c.data ?? []) as Company[]);
    setConfig(cfg.data ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleAlerts = async (enabled: boolean) => {
    setTogglingAlerts(true);
    const payload: any = { email_alerts_enabled: enabled };
    if (config?.id) payload.id = config.id;
    const { error } = await (supabase as any).from('fator_r_sync_config').upsert(payload);
    setTogglingAlerts(false);
    if (error) { toast.error('Falha ao atualizar envio real.'); return; }
    toast.success(enabled ? 'Envio real ativado.' : 'Envio real desativado (somente registro).');
    await load();
  };

  const addCompany = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Informe o nome da empresa.'); return; }
    if (newEmail && !isValidEmail(newEmail)) { toast.error('E-mail inválido.'); return; }
    setSavingNew(true);
    const normalized = newCnpj.replace(/\D/g, '') || null;
    const { error } = await (supabase as any).from('fator_r_companies').insert({
      name,
      cnpj: newCnpj.trim() || null,
      normalized_cnpj: normalized,
      responsible_email: newEmail.trim() || null,
      secondary_emails: [],
      active: true,
    });
    setSavingNew(false);
    if (error) { toast.error('Falha ao adicionar empresa.'); return; }
    toast.success('Empresa adicionada.');
    setNewName(''); setNewCnpj(''); setNewEmail(''); setAdding(false);
    await load();
  };

  const withoutEmail = companies.filter((c) => !c.responsible_email && !(c.secondary_emails?.length)).length;

  return (
    <GlassCard className="p-4 rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" /> Envio automático de alertas
          </h3>
          <p className="text-sm text-foreground/75 mt-1">
            Cada empresa abaixo recebe os alertas de Fator R nos e-mails cadastrados. PDFs com Fator R ≤ 28% disparam alerta crítico; ≤ 32% disparam alerta preventivo.
          </p>
          {withoutEmail > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {withoutEmail} empresa(s) sem destinatário — não receberão alertas até o cadastro.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground/75 font-medium">Envio real</span>
            <Switch
              checked={config?.email_alerts_enabled !== false}
              disabled={togglingAlerts}
              onCheckedChange={toggleAlerts}
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {adding ? 'Cancelar' : 'Adicionar empresa'}
          </Button>
        </div>
      </div>

      {adding && (
        <div className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 grid gap-2 md:grid-cols-4">
          <Input placeholder="Nome da empresa" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="CNPJ" value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)} />
          <Input placeholder="E-mail principal" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Button onClick={addCompany} disabled={savingNew} className="gap-1.5">
            <Save className="h-4 w-4" /> {savingNew ? 'Salvando...' : 'Salvar empresa'}
          </Button>
        </div>
      )}

      <div className="mt-4 grid gap-2">
        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-foreground/70">Carregando empresas...</div>
        ) : companies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-foreground/70">
            Nenhuma empresa cadastrada. As empresas são criadas automaticamente quando um PDF do Drive é processado, ou adicione manualmente acima.
          </div>
        ) : (
          companies.map((company) => (
            <CompanyRow key={company.id} company={company} onSaved={load} />
          ))
        )}
      </div>
    </GlassCard>
  );
}