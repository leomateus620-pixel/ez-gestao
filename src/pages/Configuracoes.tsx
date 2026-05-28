import { Clock, Database, KeyRound, Lock, Palette, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';

const controls = [
  {
    icon: Clock,
    title: 'Agendamento',
    description: 'Varredura automática da pasta a enviar a cada 5 minutos, além da execução manual.',
  },
  {
    icon: KeyRound,
    title: 'Segredos e OAuth',
    description: 'Tokens Google criptografados e chaves Twilio mantidos apenas em secrets ou Vault server-side.',
  },
  {
    icon: Database,
    title: 'Retenção LGPD',
    description: 'Bucket privado para entrega temporária de anexos, com expiracao curta e logs de auditoria.',
  },
  {
    icon: Palette,
    title: 'Liquid Glass',
    description: 'Contraste acessivel, suporte a tema escuro e reducao de animacoes pelo sistema operacional.',
  },
];

export default function Configuracoes() {
  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Configuracoes" subtitle="Seguranca e operação do envio automático de guias." />

      <GlassCard variant="elevated">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-semibold">Modo automático seguro</p>
              <p className="mt-1 text-xs text-foreground/60">
                Envio ocorre somente com CNPJ único, empresa ativa, contato válido, consentimento aplicável e conector ativo.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Política ativa</Badge>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2">
        {controls.map((control) => (
          <GlassCard key={control.title} className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <control.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{control.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/60">{control.description}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard variant="subtle">
        <div className="flex items-center gap-3">
          <Lock className="h-4 w-4 text-foreground/50" />
          <div>
            <p className="text-sm font-medium">Administrador único com Supabase Auth</p>
            <p className="text-xs text-foreground/60">Acesso anonimo foi removido das tabelas operacionais e as acoes manuais exigem sessão autenticada.</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
