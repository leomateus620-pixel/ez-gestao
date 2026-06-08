import { FormEvent, useState } from 'react';
import { AlertCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/BrandLogo';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const nextError = await signIn(email.trim(), password);
    setError(nextError);
    setSubmitting(false);
  };

  return (
    <main className="liquid-stage flex min-h-[100dvh] items-center justify-center overflow-x-hidden p-5">
      <section className="glass-card-elevated relative w-full max-w-md p-7 md:p-9" aria-label="Autenticação">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute -left-20 bottom-10 h-36 w-36 rounded-full bg-brand-metal-blue/10 blur-3xl" />
        <div className="relative">
          <div className="mb-8 flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-[hsla(var(--surface-panel-strong))] p-1.5 shadow-[0_14px_32px_-24px_hsl(var(--brand-warm-shadow))] backdrop-blur-xl">
              <BrandLogo className="h-full w-full" />
            </div>
            <div>
              <p className="font-display text-xl font-bold tracking-[-0.03em] text-[hsl(var(--text-primary))]">EZ Gestão</p>
              <p className="text-xs font-medium text-[hsl(var(--text-tertiary))]">Automação segura de guias</p>
            </div>
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary/75">Acesso restrito</p>
          <h1 className="font-display text-2xl font-bold tracking-[-0.035em] text-[hsl(var(--text-primary))]">Painel administrativo</h1>
          <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--text-secondary))]">Entre para processar documentos, acompanhar entregas e monitorar conectores.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--text-tertiary))]" />
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="bg-[hsla(var(--surface-panel-strong))] pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--text-tertiary))]" />
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="bg-[hsla(var(--surface-panel-strong))] pl-10" />
              </div>
            </div>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Credenciais inválidas ou acesso não autorizado. Confira e-mail, senha e permissão de administrador.
              </p>
            )}
            <Button type="submit" disabled={submitting} className="h-11 w-full">
              {submitting ? 'Autenticando...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-7 flex items-start gap-2 rounded-2xl border border-success/15 bg-success/8 p-3 text-xs leading-relaxed text-[hsl(var(--text-secondary))]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            Acesso restrito ao administrador. Credenciais de conectores permanecem protegidas no servidor.
          </div>
        </div>
      </section>
    </main>
  );
}
