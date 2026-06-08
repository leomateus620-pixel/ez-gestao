# EZ Gestão — revisão prática do design system

## Auditoria visual inicial

### Arquitetura atual
- **Tokens globais:** `src/index.css` concentra tokens HSL para marca, superfícies, textos, sidebar, glass, feedback e classes utilitárias (`.glass-card`, `.metric-card`, `.page-title`, `.page-subtitle`, `.liquid-stage`). `tailwind.config.ts` expõe esses tokens ao Tailwind.
- **Fontes:** `src/index.css` carrega Inter, Manrope e JetBrains Mono. `tailwind.config.ts` mapeia `font-sans`, `font-display` e `font-mono`.
- **Componentes base:** `src/components/ui/*` mantém os componentes shadcn/Radix, com padrões centrais em `button.tsx`, `input.tsx`, `table.tsx`, `badge.tsx`, `label.tsx`.
- **Cards:** `src/components/GlassCard.tsx`, `src/components/MetricCard.tsx` e classes globais `.glass-card`, `.glass-card-elevated`, `.glass-card-subtle`, `.metric-card`, `.liquid-stat-card`.
- **Layout principal:** `src/components/AppLayout.tsx` delega para `src/navigation/components/SmartNavigationShell.tsx`.
- **Sidebar/Dynamic Island:** `src/navigation/components/SmartSidebar.tsx`, `MenuIconRenderer.tsx`, `DynamicIslandPanel.tsx`, `SmartTopbar.tsx` e estado em `NavigationStateProvider.tsx`.
- **Headers:** `src/components/PageHeader.tsx` e `src/components/SectionHeader.tsx`.

### Problemas encontrados
- `--text-primary` era usado na sidebar, mas não existia nos tokens globais.
- O `body` duplicava `font-family` fora do tema, reduzindo controle tipográfico via Tailwind.
- A hierarquia de títulos estava correta, mas genérica; `.page-title` usava `font-extrabold` e pouco refinamento de line-height.
- Métricas e cards tinham aparência muito parecida, com glass uniforme e números sem regra global de tabular numbers.
- `h-screen`/`min-h-screen` apareciam no shell, sidebar, login e fallback de erro, com risco em viewport mobile.
- `PageHeader` sempre exibia “Área de trabalho”, mesmo em páginas com contexto mais específico.
- Empty states do dashboard eram textos soltos e pouco orientativos.
- Mensagens visíveis sem acento reduziam percepção de qualidade: “Excecoes”, “pendencia”, “Nao”, “sessao”, “modulo”.
- Estados de foco/pressed existiam, mas podiam ficar mais consistentes em botões, métricas e sidebar.

### Riscos de alteração
- **Muito sensíveis:** `SmartNavigationShell.tsx` e `SmartSidebar.tsx`, pois controlam scroll, preload, colapso, navegação, Escape e comportamento mobile.
- **Globais:** `src/index.css`, `tailwind.config.ts`, `button.tsx`, `input.tsx` e `label.tsx`, pois afetam todo o app.
- **Fluxo crítico:** `Login.tsx` e `App.tsx`, onde mudanças visuais não podem tocar em `signIn`, providers, sessão, rotas ou Supabase.
- **Dashboard:** `Dashboard.tsx` deve preservar cálculo de métricas, filtros, links e ações.

## Decisões implementadas

### Fontes
- **Texto:** Inter (`font-sans`) para leitura densa de dashboard.
- **Display/headings:** Manrope (`font-display`) para títulos e métricas com mais presença.
- **Mono:** JetBrains Mono (`font-mono`) para logs, números técnicos e áreas que já usam mono.
- **Alternativa escolhida:** conservadora. Não foi adicionada dependência de fontes, evitando risco de layout, bundle e carregamento.

### Tokens de texto
- `--text-primary`: texto principal sobre superfícies e sidebar.
- `--text-secondary`: descrições, subtítulos, textos auxiliares importantes.
- `--text-tertiary`: metadados, hints, labels secundários.

### Tokens de superfície e glass
- `--surface-readable`: superfícies principais legíveis.
- `--surface-readable-muted`: variação mais suave.
- `--surface-panel`: painéis internos e empty states.
- `--surface-panel-strong`: inputs, ícones e elementos que precisam de maior contraste.
- `--glass-bg`, `--glass-border`, `--glass-shadow`, `--glass-highlight`, `--glass-glow`: base liquid glass.
- `--metric-surface`, `--metric-border`: diferenciação específica para métricas.

### Cards
- Use `GlassCard` para painéis e blocos informativos.
- Use `variant="elevated"` para blocos prioritários, como resumo e painéis de dashboard.
- Use `variant="subtle"` para áreas de apoio.
- Use `MetricCard` exclusivamente para indicadores acionáveis ou valores de leitura rápida.
- Métricas devem usar tabular numbers e ícones lucide em tamanho consistente, sem misturar bibliotecas nesta fase.

### Sidebar
- A sidebar mantém o comportamento atual de hover, collapse, touch, preload e Escape.
- Labels usam `font-display` com peso menor que `extrabold` para legibilidade.
- `h-screen` foi substituído por `h-[100dvh]`; o scroll interno usa cálculo em `100dvh`.
- Estados ativo, hover, focus e pressed devem permanecer leves e com foco visível.

### Motion e responsividade
- Transições devem ser curtas e funcionais; evitar animação pesada em dashboard operacional.
- `prefers-reduced-motion` segue respeitado globalmente.
- Use `min-h-[100dvh]`/`h-[100dvh]` em telas de app shell, login e erros de tela cheia.
- Evite scroll horizontal usando `overflow-x-hidden` no shell principal.
