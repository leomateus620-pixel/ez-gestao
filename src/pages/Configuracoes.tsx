import { GlassCard } from '@/components/GlassCard';
import { PageHeader } from '@/components/PageHeader';
import { Settings, ShieldCheck, Users, Palette } from 'lucide-react';

export default function Configuracoes() {
  const sections = [
    { icon: ShieldCheck, title: 'Tipos de CND', desc: 'Gerenciar tipos de certidões disponíveis no sistema' },
    { icon: Users, title: 'Perfis e Usuários', desc: 'Configurar perfis de acesso e usuários internos' },
    { icon: Settings, title: 'Preferências', desc: 'Configurações gerais do sistema, notificações e integrações' },
    { icon: Palette, title: 'Aparência', desc: 'Personalizar tema, cores e layout do sistema' },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      <PageHeader title="Configurações" subtitle="Gerencie as preferências do sistema" />

      <div className="grid sm:grid-cols-2 gap-4">
        {sections.map(s => (
          <div key={s.title} className="glass-card p-5 cursor-pointer transition-all duration-200 hover:shadow-md group">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary group-hover:bg-primary/12 transition-colors">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <GlassCard variant="subtle">
        <div className="text-center py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mx-auto mb-4">
            <Settings className="h-7 w-7 text-muted-foreground/40 animate-pulse-soft" />
          </div>
          <p className="text-sm font-medium text-foreground">Configurações completas na Fase 2</p>
          <p className="text-xs text-muted-foreground mt-1.5">Integração com backend, regras de acesso e automações</p>
        </div>
      </GlassCard>
    </div>
  );
}
