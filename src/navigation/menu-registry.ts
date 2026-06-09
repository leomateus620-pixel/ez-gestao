import {
  AlertTriangle,
  Bell,
  Building2,
  Cog,
  FileText,
  FolderSync,
  LayoutDashboard,
  MessageCircle,
  Percent,
  Landmark,
  Plug,
  ScanLine,
  Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type MenuPriority = 'high' | 'medium' | 'low';

export interface QuickAction {
  id: string;
  label: string;
  route?: string;
  intent?: 'primary' | 'neutral';
}

export interface MenuItemConfig {
  id: string;
  label: string;
  shortDescription: string;
  route: string;
  icon: LucideIcon;
  group: 'principal' | 'guias';
  parent?: string;
  children?: string[];
  visibilityRules?: { mobileHidden?: boolean; requiresFeature?: string };
  priority: MenuPriority;
  contextRelevance: string[];
  quickActions?: QuickAction[];
  badgeKey?: 'guidesWaiting' | 'guideExceptions' | 'alerts';
  mobileBehavior?: 'peek' | 'expand';
  a11yLabel: string;
}

export const menuRegistry: MenuItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', shortDescription: 'Visao geral e metricas', route: '/', icon: LayoutDashboard, group: 'principal', priority: 'high', contextRelevance: ['dashboard'], quickActions: [{ id: 'open-metrics', label: 'Ver metricas', route: '/' }], a11yLabel: 'Abrir dashboard' },
  { id: 'guias', label: 'Guias', shortDescription: 'Fluxo de emissão e envio', route: '/guias', icon: FolderSync, group: 'principal', children: ['guias-fila', 'guias-enviadas', 'guias-excecoes'], priority: 'high', contextRelevance: ['guias', 'guias/fila', 'guias/enviadas', 'guias/excecoes'], quickActions: [{ id: 'process-now', label: 'Processar agora', route: '/guias/fila', intent: 'primary' }], badgeKey: 'guidesWaiting', a11yLabel: 'Abrir módulo de guias' },
  { id: 'guias-fila', label: 'Fila', shortDescription: 'Guias aguardando processamento', route: '/guias/fila', icon: FileText, group: 'guias', parent: 'guias', priority: 'high', contextRelevance: ['guias/fila'], a11yLabel: 'Abrir fila de guias' },
  { id: 'guias-enviadas', label: 'Enviadas', shortDescription: 'Guias ja transmitidas', route: '/guias/enviadas', icon: Send, group: 'guias', parent: 'guias', priority: 'medium', contextRelevance: ['guias/enviadas'], a11yLabel: 'Abrir guias enviadas' },
  { id: 'guias-excecoes', label: 'Exceções', shortDescription: 'Itens que exigem revisão', route: '/guias/excecoes', icon: AlertTriangle, group: 'guias', parent: 'guias', priority: 'high', contextRelevance: ['guias/excecoes'], badgeKey: 'guideExceptions', a11yLabel: 'Abrir exceções de guias' },
  { id: 'empresas', label: 'Empresas', shortDescription: 'Cadastros e gestao', route: '/empresas', icon: Building2, group: 'principal', priority: 'high', contextRelevance: ['empresas'], quickActions: [{ id: 'new-company', label: 'Nova empresa', route: '/empresas', intent: 'primary' }], a11yLabel: 'Abrir empresas' },
  { id: 'integracoes', label: 'Integracoes', shortDescription: 'Conectores e status', route: '/integracoes', icon: Plug, group: 'principal', priority: 'high', contextRelevance: ['integracoes'], quickActions: [{ id: 'manage-connectors', label: 'Gerenciar conexoes', route: '/integracoes', intent: 'primary' }], a11yLabel: 'Abrir integracoes' },
  { id: 'fator-r', label: 'Fator R', shortDescription: 'Monitoramento PGDAS e alertas', route: '/fator-r', icon: Percent, group: 'principal', priority: 'high', contextRelevance: ['fator-r'], a11yLabel: 'Abrir módulo Fator R' },
  { id: 'reforma-tributaria', label: 'Reforma Tributária', shortDescription: 'Triagem de regime e créditos', route: '/reforma-tributaria', icon: Landmark, group: 'principal', priority: 'high', contextRelevance: ['reforma-tributaria'], quickActions: [{ id: 'new-tax-reform-company', label: 'Nova análise', route: '/reforma-tributaria', intent: 'primary' }], a11yLabel: 'Abrir Reforma Tributária' },
  { id: 'classifica', label: 'Classifica', shortDescription: 'Classificação inteligente de notas', route: '/classifica', icon: ScanLine, group: 'principal', priority: 'high', contextRelevance: ['classifica'], quickActions: [{ id: 'classifica-dashboard', label: 'Dashboard Classifica', route: '/classifica' }, { id: 'classifica-sync', label: 'Importar/sincronizar notas', route: '/classifica', intent: 'primary' }, { id: 'classifica-review', label: 'Fila de revisão', route: '/classifica' }, { id: 'classifica-rules', label: 'Regras do robô', route: '/classifica' }, { id: 'classifica-logs', label: 'Logs', route: '/classifica' }], a11yLabel: 'Abrir módulo Classifica' },
  { id: 'envios', label: 'Envios', shortDescription: 'Historico e status de entregas', route: '/envios', icon: Send, group: 'principal', priority: 'medium', contextRelevance: ['envios'], a11yLabel: 'Abrir envios' },
  { id: 'alertas', label: 'Alertas', shortDescription: 'Central de alertas pendentes', route: '/alertas', icon: Bell, group: 'principal', priority: 'medium', contextRelevance: ['alertas'], badgeKey: 'alerts', a11yLabel: 'Abrir alertas' },
  { id: 'whatsapp', label: 'WhatsApp', shortDescription: 'Mensageria e status de envios', route: '/whatsapp', icon: MessageCircle, group: 'principal', priority: 'medium', contextRelevance: ['whatsapp'], a11yLabel: 'Abrir módulo WhatsApp' },
  { id: 'configuracoes', label: 'Configuracoes', shortDescription: 'Preferencias do sistema', route: '/configuracoes', icon: Cog, group: 'principal', priority: 'medium', contextRelevance: ['configuracoes'], a11yLabel: 'Abrir configuracoes' },
];

export const topbarHubs = [
  { id: 'search', label: 'Busca', shortDescription: 'Global e contextual' },
  { id: 'notifications', label: 'Notificacoes', shortDescription: 'Atualizacoes importantes' },
  { id: 'profile', label: 'Perfil', shortDescription: 'Conta e sessão' },
] as const;
