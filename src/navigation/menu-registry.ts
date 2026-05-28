import { AlertTriangle, Building2, Cog, FolderSync, LayoutDashboard, Plug, Search, Send, FileText, MessageCircle, Percent } from 'lucide-react';
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
  group: 'principal' | 'guias' | 'legacy';
  parent?: string;
  children?: string[];
  visibilityRules?: { mobileHidden?: boolean; requiresFeature?: string };
  priority: MenuPriority;
  contextRelevance: string[];
  quickActions?: QuickAction[];
  badgeKey?: 'guidesWaiting' | 'guideExceptions' | 'alerts' | 'legacyExceptions';
  mobileBehavior?: 'peek' | 'expand';
  a11yLabel: string;
}

export const menuRegistry: MenuItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', shortDescription: 'Visão geral e métricas', route: '/', icon: LayoutDashboard, group: 'principal', priority: 'high', contextRelevance: ['dashboard'], quickActions: [{ id: 'open-metrics', label: 'Ver métricas', route: '/' }], a11yLabel: 'Abrir dashboard' },
  { id: 'guias', label: 'Guias', shortDescription: 'Fluxo de emissão e envio', route: '/guias/fila', icon: FolderSync, group: 'principal', children: ['guias-fila', 'guias-enviadas', 'guias-excecoes'], priority: 'high', contextRelevance: ['guias', 'guias/fila', 'guias/enviadas', 'guias/excecoes'], quickActions: [{ id: 'process-now', label: 'Processar agora', route: '/guias/fila', intent: 'primary' }], badgeKey: 'guidesWaiting', a11yLabel: 'Abrir módulo de guias' },
  { id: 'guias-fila', label: 'Fila', shortDescription: 'Guias aguardando processamento', route: '/guias/fila', icon: FileText, group: 'guias', parent: 'guias', priority: 'high', contextRelevance: ['guias/fila'], a11yLabel: 'Abrir fila de guias' },
  { id: 'guias-enviadas', label: 'Enviadas', shortDescription: 'Guias já transmitidas', route: '/guias/enviadas', icon: Send, group: 'guias', parent: 'guias', priority: 'medium', contextRelevance: ['guias/enviadas'], a11yLabel: 'Abrir guias enviadas' },
  { id: 'guias-excecoes', label: 'Exceções', shortDescription: 'Itens que exigem revisão', route: '/guias/excecoes', icon: AlertTriangle, group: 'guias', parent: 'guias', priority: 'high', contextRelevance: ['guias/excecoes'], badgeKey: 'guideExceptions', a11yLabel: 'Abrir exceções de guias' },
  { id: 'empresas', label: 'Empresas', shortDescription: 'Cadastros e gestão', route: '/empresas', icon: Building2, group: 'principal', priority: 'high', contextRelevance: ['empresas'], quickActions: [{ id: 'new-company', label: 'Nova empresa', route: '/empresas', intent: 'primary' }], a11yLabel: 'Abrir empresas' },
  { id: 'integracoes', label: 'Integrações', shortDescription: 'Conectores e status', route: '/integracoes', icon: Plug, group: 'principal', priority: 'high', contextRelevance: ['integracoes'], quickActions: [{ id: 'manage-connectors', label: 'Gerenciar conexões', route: '/integracoes', intent: 'primary' }], a11yLabel: 'Abrir integrações' },
  { id: 'fator-r', label: 'Fator R', shortDescription: 'Monitoramento PGDAS e alertas', route: '/fator-r', icon: Percent, group: 'principal', priority: 'high', contextRelevance: ['fator-r'], a11yLabel: 'Abrir módulo Fator R' },
  { id: 'whatsapp', label: 'WhatsApp', shortDescription: 'Mensageria e status de envios', route: '/whatsapp', icon: MessageCircle, group: 'principal', priority: 'medium', contextRelevance: ['whatsapp'], a11yLabel: 'Abrir módulo WhatsApp' },
  { id: 'configuracoes', label: 'Configurações', shortDescription: 'Preferências do sistema', route: '/configuracoes', icon: Cog, group: 'principal', priority: 'medium', contextRelevance: ['configuracoes'], a11yLabel: 'Abrir configurações' },
  { id: 'legacy-consulta', label: 'Consulta CND (legado)', shortDescription: 'Módulos antigos e diagnóstico', route: '/automacao', icon: Search, group: 'legacy', priority: 'low', contextRelevance: ['automacao', 'consulta'], badgeKey: 'legacyExceptions', a11yLabel: 'Abrir navegação legado' },
];

export const topbarHubs = [
  { id: 'search', label: 'Busca', shortDescription: 'Global e contextual' },
  { id: 'notifications', label: 'Notificações', shortDescription: 'Atualizações importantes' },
  { id: 'profile', label: 'Perfil', shortDescription: 'Conta e sessão' },
] as const;
