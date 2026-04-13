import { GlassCard } from '@/components/GlassCard';
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie as preferências do sistema</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {sections.map(s => (
          <GlassCard key={s.title} hover className="cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <div className="text-center py-8">
          <Settings className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3 animate-pulse-soft" />
          <p className="text-sm text-muted-foreground">Configurações completas serão implementadas na Fase 2</p>
          <p className="text-xs text-muted-foreground mt-1">Integração com backend, regras de acesso e automações</p>
        </div>
      </GlassCard>
    </div>
  );
}
