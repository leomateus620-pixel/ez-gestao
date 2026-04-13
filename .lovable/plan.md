

# Sistema Premium de Gestão de CNDs — Fase 1

## Visão Geral
Sistema completo de gestão de certidões negativas com design liquid glass premium, navegação por sidebar, dados mock para demonstração, e toda a estrutura operacional funcional no frontend.

## Design System
- Tema **liquid glass**: backgrounds com glassmorphism sutil (backdrop-blur, transparências), sombras suaves, bordas refinadas com brilho
- Paleta profissional: tons de azul-escuro/slate como primário, acentos em violet/indigo, alertas em amber/red/green
- Tipografia com hierarquia clara, espaçamento generoso, cards sob medida
- Skeleton loaders e transições suaves em toda a UI

## Estrutura de Navegação (Sidebar)
1. **Dashboard** — visão executiva-operacional
2. **Empresas** — cadastro, listagem, detalhe com abas
3. **Agenda** — vencimentos em lista, calendário e timeline
4. **Certidões / CNDs** — checklist por empresa
5. **Documentos** — biblioteca centralizada de PDFs
6. **Envios** — histórico de e-mail/WhatsApp
7. **Alertas** — centro de notificações
8. **Logs** — rastreamento de acesso e leitura
9. **Configurações** — tipos de CND, perfis, preferências

## Módulos e Telas

### 1. Dashboard
- Cards de métricas: vencidas, vencendo, pendentes, enviados, acessos pendentes, empresas críticas
- Gráfico de distribuição de status (chart elegante)
- Lista de ações urgentes com atalhos rápidos
- Resumo de alertas ativos

### 2. Empresas
- **Listagem**: busca por razão social/CNPJ/município, filtros por status/regime/responsável, indicadores visuais por empresa
- **Cadastro/Edição**: formulário completo com validação de CNPJ, máscaras, todos os campos especificados
- **Detalhe**: cabeçalho com dados principais + abas (Visão Geral, Checklist CNDs, Documentos, Vencimentos, Envios, Logs, Observações) + bloco de ações rápidas + resumo de saúde documental

### 3. Agenda de Vencimentos
- Vista em lista com prioridades visuais (vencido → vermelho, hoje → laranja, 3 dias → amarelo, 7 dias → azul, válido → verde)
- Vista calendário mensal
- Vista timeline
- Ações rápidas: abrir empresa, marcar revisão, anexar PDF, reenviar, gerar alerta

### 4. Checklist de CNDs
- Tipos: Receita Federal, FGTS, SEFAZ, Municipal, Trabalhista, Personalizada
- Cada item: tipo, status calculado, datas, origem, PDF vinculado, observação, responsável, histórico
- Status: válida, vencendo, vencida, pendente, erro, não aplicável
- Checklist padrão por regime + edição manual por empresa

### 5. Documentos / PDFs
- Upload com versionamento (substituir sem perder histórico)
- Biblioteca com filtros por empresa, tipo, data, validade, status
- Preview rápido, download, metadados (nome, data upload, responsável, validade)

### 6. Envios
- Fluxo assistido: selecionar empresa → documentos → canal (e-mail/WhatsApp) → destinatário → mensagem
- Histórico completo com filtros por canal, empresa, período, status
- Registro: data/hora, canal, usuário, destinatário, documentos, status

### 7. Alertas
- Motor de regras: vencimento 7/3/1/0 dias, documento vencido, ausência de PDF, checklist incompleto
- Centro de notificações: lido/não lido, prioridade visual, snooze, resolver
- Exibição no dashboard e na página da empresa

### 8. Logs
- Timeline de acesso por empresa: envio, abertura, visualização, download
- Visão admin: quem acessou, quem não, quando, por qual canal
- Filtros por empresa, envio, canal, período

## Dados e Lógica
- Dados mock realistas para ~10 empresas com CNDs em diversos estados
- Cálculo automático de status baseado em datas
- Recálculo imediato ao alterar dados (otimistic updates)
- Contadores e cards sempre refletindo estado real

## Responsividade
- Desktop: layout completo com sidebar, grids, tabelas elegantes
- Tablet: reorganização de blocos mantendo usabilidade
- Mobile: sidebar em drawer, tabelas viram cards, filtros em sheet, ações rápidas priorizadas

## Componentes Reutilizáveis
- GlassCard, StatusBadge, PriorityIndicator, MetricCard
- DataTable com paginação, sort e filtros
- SearchBar com filtros avançados
- FileUploader com preview e versionamento
- TimelineView, CalendarView
- NotificationCenter, AlertBanner
- SkeletonLoaders para cada tipo de conteúdo
- EmptyState elegante por contexto

## Estrutura de Arquivos
- `/src/pages/` — uma página por rota principal
- `/src/components/` — componentes compartilhados e específicos por módulo
- `/src/data/` — dados mock e tipos TypeScript
- `/src/hooks/` — hooks customizados (filtros, cálculos de status, alertas)
- `/src/lib/` — utilitários (validação CNPJ, formatação, cálculos de datas)

## Preparação para Fase 2
- Interfaces e tipos bem definidos para futura integração com Supabase
- Estrutura de serviços separada para substituir mock por API real
- Hooks abstraídos para facilitar migração para React Query + backend

