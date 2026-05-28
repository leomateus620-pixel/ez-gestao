import { FormEvent, useState } from 'react';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <main className="liquid-stage flex min-h-screen items-center justify-center p-5">
      <section className="glass-card-elevated relative w-full max-w-md p-7 md:p-9" aria-label="Autenticacao">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-sm font-bold text-white shadow-lg shadow-primary/20">EZ</div>
            <div>
              <p className="text-xl font-bold tracking-tight">EZ Gestão</p>
              <p className="text-xs text-foreground/55">Automação segura de guias</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold">Acesso administrativo</h1>
          <p className="mt-2 text-sm text-foreground/60">Entre para processar documentos e monitorar entregas.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-foreground/40" />
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" />
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">Credenciais invalidas ou acesso não autorizado.</p>}
            <Button type="submit" disabled={submitting} className="h-11 w-full">
              {submitting ? 'Autenticando...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-7 flex items-start gap-2 rounded-xl bg-success/8 p-3 text-xs text-foreground/60">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            Acesso restrito ao administrador. Credenciais de conectores permanecem no servidor.
          </div>
        </div>
      </section>
    </main>
  );
}
