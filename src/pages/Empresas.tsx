import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/data/DataProvider';
import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { HealthBar } from '@/components/HealthBar';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatCNPJ, getRegimeLabel, maskCNPJ, validateCNPJ, validateEmail, sanitizeInput } from '@/lib/formatters';
import { calcularResumoEmpresa } from '@/lib/status-utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, Building2, MapPin, ArrowRight, ArrowUpDown, Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CanalEnvio, Empresa, RegimeTributario } from '@/data/types';

type SortField = 'nome' | 'vencidas' | 'status';
const ITEMS_PER_PAGE = 20;

const emptyEmpresa = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', regimeTributario: 'simples_nacional' as RegimeTributario,
  municipio: '', estado: '', responsavelInterno: '', responsavelCliente: '',
  emailPrincipal: '', whatsappPrincipal: '', observacoes: '',
  canalPreferido: 'email' as CanalEnvio, emailValidado: false, whatsappOptIn: false,
  comunicacaoAtiva: true, saudacaoGuia: '',
};

export default function Empresas() {
  const navigate = useNavigate();
  const { state, addEmpresa, cnpjExists } = useDataStore();
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroRegime, setFiltroRegime] = useState<string>('todos');
  const [sortBy, setSortBy] = useState<SortField>('nome');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyEmpresa);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const resumos = useMemo(() => {
    const map: Record<string, ReturnType<typeof calcularResumoEmpresa>> = {};
    state.empresas.forEach(e => { map[e.id] = calcularResumoEmpresa(e.id, state.cnds); });
    return map;
  }, [state.empresas, state.cnds]);

  const empresasFiltradas = useMemo(() => {
    const filtered = state.empresas.filter(e => {
      const matchBusca = !busca ||
        e.razaoSocial.toLowerCase().includes(busca.toLowerCase()) ||
        e.nomeFantasia.toLowerCase().includes(busca.toLowerCase()) ||
        e.cnpj.includes(busca.replace(/\D/g, '')) ||
        e.municipio.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = filtroStatus === 'todos' || e.status === filtroStatus;
      const matchRegime = filtroRegime === 'todos' || e.regimeTributario === filtroRegime;
      return matchBusca && matchStatus && matchRegime;
    });
    return filtered.sort((a, b) => {
      if (sortBy === 'nome') return a.nomeFantasia.localeCompare(b.nomeFantasia);
      if (sortBy === 'vencidas') return (resumos[b.id]?.vencidas ?? 0) - (resumos[a.id]?.vencidas ?? 0);
      return 0;
    });
  }, [state.empresas, busca, filtroStatus, filtroRegime, sortBy, resumos]);

  const paginatedEmpresas = useMemo(() => empresasFiltradas.slice(0, page * ITEMS_PER_PAGE), [empresasFiltradas, page]);
  const hasMore = paginatedEmpresas.length < empresasFiltradas.length;

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!form.razaoSocial.trim()) errors.razaoSocial = 'Obrigatório';
    if (!form.nomeFantasia.trim()) errors.nomeFantasia = 'Obrigatório';
    const cnpjDigits = form.cnpj.replace(/\D/g, '');
    if (!cnpjDigits) errors.cnpj = 'Obrigatório';
    else if (!validateCNPJ(cnpjDigits)) errors.cnpj = 'CNPJ inválido';
    else if (cnpjExists(cnpjDigits)) errors.cnpj = 'CNPJ já cadastrado';
    if (form.canalPreferido === 'email' && !form.emailPrincipal.trim()) errors.emailPrincipal = 'Obrigatório para envio por e-mail';
    else if (form.emailPrincipal && !validateEmail(form.emailPrincipal)) errors.emailPrincipal = 'E-mail inválido';
    if (form.canalPreferido === 'whatsapp' && !/^\+[1-9]\d{7,14}$/.test(form.whatsappPrincipal.trim())) {
      errors.whatsappPrincipal = 'Informe no formato E.164, como +5511999999999';
    }
    if (!form.municipio.trim()) errors.municipio = 'Obrigatório';
    if (!form.estado.trim()) errors.estado = 'Obrigatório';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form, cnpjExists]);

  const handleSubmit = useCallback(() => {
    if (!validateForm()) return;
    const newEmpresa: Empresa = {
      id: `emp-${Date.now()}`,
      razaoSocial: sanitizeInput(form.razaoSocial),
      nomeFantasia: sanitizeInput(form.nomeFantasia),
      cnpj: form.cnpj.replace(/\D/g, ''),
      regimeTributario: form.regimeTributario,
      municipio: sanitizeInput(form.municipio),
      estado: sanitizeInput(form.estado),
      responsavelInterno: sanitizeInput(form.responsavelInterno),
      responsavelCliente: sanitizeInput(form.responsavelCliente),
      emailPrincipal: form.emailPrincipal.trim(),
      whatsappPrincipal: form.whatsappPrincipal.trim(),
      canalPreferido: form.canalPreferido,
      emailValidado: form.emailValidado,
      whatsappOptInAt: form.whatsappOptIn ? new Date().toISOString() : null,
      comunicacaoAtiva: form.comunicacaoAtiva,
      saudacaoGuia: sanitizeInput(form.saudacaoGuia),
      observacoes: sanitizeInput(form.observacoes),
      status: 'ativa',
      criadoEm: new Date().toISOString().split('T')[0],
      atualizadoEm: new Date().toISOString().split('T')[0],
    };
    const success = addEmpresa(newEmpresa);
    if (success) {
      toast.success('Empresa criada com sucesso', { description: `${newEmpresa.nomeFantasia} está disponível para o roteamento de guias.` });
      setShowForm(false);
      setForm(emptyEmpresa);
      setFormErrors({});
    } else {
      toast.error('Erro ao criar empresa', { description: 'CNPJ já cadastrado no sistema.' });
    }
  }, [form, validateForm, addEmpresa]);

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Empresas" subtitle={`${state.empresas.length} empresas cadastradas`}>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Nova Empresa
        </Button>
      </PageHeader>

      <div className="filter-bar">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por razão social, CNPJ, município..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9 bg-transparent" />
          </div>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="arquivada">Arquivada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroRegime} onValueChange={setFiltroRegime}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Regime" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os regimes</SelectItem>
              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
              <SelectItem value="lucro_real">Lucro Real</SelectItem>
              <SelectItem value="mei">MEI</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
            <SelectTrigger className="w-full sm:w-40">
              <div className="flex items-center gap-1.5"><ArrowUpDown className="h-3 w-3" /><SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Nome A-Z</SelectItem>
              <SelectItem value="vencidas">Mais vencidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {paginatedEmpresas.map((empresa, i) => {
          const resumo = resumos[empresa.id];
          return (
            <div key={empresa.id} className={cn('glass-card p-4 cursor-pointer transition-all duration-200 hover:shadow-md group', i % 2 === 1 && 'bg-card/30')} onClick={() => navigate(`/empresas/${empresa.id}`)}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary text-xs font-bold">
                    {empresa.nomeFantasia.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{empresa.nomeFantasia}</p>
                      <StatusBadge status={empresa.status} variant="empresa" />
                    </div>
                    <p className="text-[11px] text-foreground/60 truncate">{empresa.razaoSocial}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-foreground/60">
                      <span className="font-mono">{formatCNPJ(empresa.cnpj)}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{empresa.municipio}/{empresa.estado}</span>
                      <span className="hidden sm:inline">{getRegimeLabel(empresa.regimeTributario)}</span>
                      <Badge variant="outline" className="gap-1 text-[10px] capitalize">
                        {empresa.canalPreferido === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                        {empresa.canalPreferido || 'sem canal'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                  {resumo && resumo.total > 0 && (
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex gap-3">
                        {resumo.vencidas > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{resumo.vencidas}</span>}
                        {resumo.vencendo > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-warning"><span className="h-1.5 w-1.5 rounded-full bg-warning" />{resumo.vencendo}</span>}
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />{resumo.validas}</span>
                      </div>
                      <HealthBar validas={resumo.validas} vencendo={resumo.vencendo} vencidas={resumo.vencidas} pendentes={resumo.pendentes} total={resumo.total} className="w-32" />
                    </div>
                  )}
                  <ArrowRight className="h-4 w-4 text-foreground/30 group-hover:text-foreground/60 transition-colors" />
                </div>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
              Carregar mais ({empresasFiltradas.length - paginatedEmpresas.length} restantes)
            </Button>
          </div>
        )}
        {empresasFiltradas.length === 0 && (
          <EmptyState icon={Building2} title="Nenhuma empresa encontrada" description="Tente ajustar os filtros ou adicione uma nova empresa." actionLabel="Nova Empresa" onAction={() => setShowForm(true)} />
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Razão Social *</Label>
                <Input value={form.razaoSocial} onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))} className={formErrors.razaoSocial ? 'border-destructive' : ''} />
                {formErrors.razaoSocial && <p className="text-[10px] text-destructive mt-0.5">{formErrors.razaoSocial}</p>}
              </div>
              <div>
                <Label className="text-xs">Nome Fantasia *</Label>
                <Input value={form.nomeFantasia} onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))} className={formErrors.nomeFantasia ? 'border-destructive' : ''} />
                {formErrors.nomeFantasia && <p className="text-[10px] text-destructive mt-0.5">{formErrors.nomeFantasia}</p>}
              </div>
              <div>
                <Label className="text-xs">CNPJ *</Label>
                <Input value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: maskCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" className={formErrors.cnpj ? 'border-destructive' : ''} />
                {formErrors.cnpj && <p className="text-[10px] text-destructive mt-0.5">{formErrors.cnpj}</p>}
              </div>
              <div>
                <Label className="text-xs">Regime Tributário</Label>
                <Select value={form.regimeTributario} onValueChange={v => setForm(f => ({ ...f, regimeTributario: v as RegimeTributario }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                    <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="lucro_real">Lucro Real</SelectItem>
                    <SelectItem value="mei">MEI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input type="email" value={form.emailPrincipal} onChange={e => setForm(f => ({ ...f, emailPrincipal: e.target.value }))} className={formErrors.emailPrincipal ? 'border-destructive' : ''} />
                {formErrors.emailPrincipal && <p className="text-[10px] text-destructive mt-0.5">{formErrors.emailPrincipal}</p>}
              </div>
              <div>
                <Label className="text-xs">WhatsApp (E.164)</Label>
                <Input value={form.whatsappPrincipal} onChange={e => setForm(f => ({ ...f, whatsappPrincipal: e.target.value.replace(/[^\d+]/g, '') }))} placeholder="+5511999999999" className={formErrors.whatsappPrincipal ? 'border-destructive' : ''} />
                {formErrors.whatsappPrincipal && <p className="text-[10px] text-destructive mt-0.5">{formErrors.whatsappPrincipal}</p>}
              </div>
              <div className="col-span-2 rounded-xl border border-border/60 bg-muted/25 p-4 space-y-4">
                <div>
                  <Label className="text-xs">Canal preferido para guias *</Label>
                  <Select value={form.canalPreferido} onValueChange={v => setForm(f => ({ ...f, canalPreferido: v as CanalEnvio }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">E-mail com PDF anexo</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp com documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium">Comunicação ativa</p>
                    <p className="text-[11px] text-foreground/55">Permite que validações iniciem envios automáticos.</p>
                  </div>
                  <Switch checked={form.comunicacaoAtiva} onCheckedChange={checked => setForm(f => ({ ...f, comunicacaoAtiva: checked }))} />
                </div>
                {form.canalPreferido === 'email' ? (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">E-mail validado</p>
                      <p className="text-[11px] text-foreground/55">Sem validação, a guia vai para exceção.</p>
                    </div>
                    <Switch checked={form.emailValidado} onCheckedChange={checked => setForm(f => ({ ...f, emailValidado: checked }))} />
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">Opt-in WhatsApp registrado</p>
                      <p className="text-[11px] text-foreground/55">Obrigatório para envio por template utilitário.</p>
                    </div>
                    <Switch checked={form.whatsappOptIn} onCheckedChange={checked => setForm(f => ({ ...f, whatsappOptIn: checked }))} />
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs">Município *</Label>
                <Input value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} className={formErrors.municipio ? 'border-destructive' : ''} />
                {formErrors.municipio && <p className="text-[10px] text-destructive mt-0.5">{formErrors.municipio}</p>}
              </div>
              <div>
                <Label className="text-xs">Estado *</Label>
                <Input value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} className={formErrors.estado ? 'border-destructive' : ''} />
                {formErrors.estado && <p className="text-[10px] text-destructive mt-0.5">{formErrors.estado}</p>}
              </div>
              <div>
                <Label className="text-xs">Responsável Interno</Label>
                <Input value={form.responsavelInterno} onChange={e => setForm(f => ({ ...f, responsavelInterno: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Responsável Cliente</Label>
                <Input value={form.responsavelCliente} onChange={e => setForm(f => ({ ...f, responsavelCliente: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Saudação opcional da guia</Label>
                <Input value={form.saudacaoGuia} onChange={e => setForm(f => ({ ...f, saudacaoGuia: e.target.value }))} placeholder="Olá, equipe financeira." />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setFormErrors({}); }}>Cancelar</Button>
            <Button onClick={handleSubmit}>Criar Empresa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
