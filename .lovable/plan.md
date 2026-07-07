# Redesign do hero de /guias (Cyber-premium split glass)

Aplicar a direção escolhida diretamente sobre o hero atual em `src/pages/guias/Guias.tsx`, preservando toda a lógica (props, hooks, estados) e trocando **apenas a apresentação**. Sem novas rotas, dados falsos ou dependências.

## Tokens travados (paleta Midnight Indigo + Sora/Manrope)

Vou adicionar tokens no `src/index.css` (namespace `--guide-hero-*`) para não sujar outros módulos:

- `--guide-bg: #0a0a1a`
- `--guide-surface: #141432`
- `--guide-surface-2: #1e1e5a`
- `--guide-accent: #4f46e5` (indigo-600)
- `--guide-accent-soft: rgba(79,70,229,0.10)`
- `--guide-border: rgba(79,70,229,0.20)`
- `--guide-text: #ffffff`
- `--guide-text-muted: rgba(199,210,254,0.60)` (indigo-200/60, AA sobre `#0a0a1a`)
- `--guide-ok: #34d399`
- `--guide-warn: #fb7185`

Fontes: adicionar `@fontsource/sora` e `@fontsource/manrope` via `bun add`, importar em `src/main.tsx`, e registrar `fontFamily.sora` / `fontFamily.manrope` em `tailwind.config.ts`. Sem `<link>` do Google Fonts.

## Mudanças em `src/pages/guias/Guias.tsx` (só o `<section class="guide-hero">` de nível superior — linhas 689-725)

Trocar por split-screen 2 colunas com layout do protótipo `v3`:

**Coluna esquerda**
- Chips reais (não mock): "Drive + CNPJ + contatos" (mantém a copy atual) — pill indigo `bg-indigo-500/10 border-indigo-500/20 text-indigo-300`.
- H1 "Envio de Guias" em Sora 800, tracking-tight, `text-white`.
- Subtítulo atual em Manrope, `text-[hsl(var(--guide-text-muted))]`, max-w-lg.
- Cluster de CTAs (mantendo handlers existentes):
  - Primário `Verificar guias no Drive` — bg indigo-600, shadow indigo, com Loader2 quando `isScanning`.
  - Secundário `Revisão manual` — `bg-[#141432] border-indigo-500/20`, link para `/guias/revisao`.
  - Ghost `Pastas` — texto indigo-400 → hover white, chama `bootstrap.mutate()`.

**Coluna direita**
- Glow decorativo `bg-indigo-600/10 blur-3xl` atrás.
- Badge "Fluxo monitorado" no topo à direita: `bg-[#141432]/80 backdrop-blur-xl border-indigo-500/30`, dot esmeralda com `animate-pulse`. Quando `isScanning`, dot vira indigo pulsante e label muda para "Verificando agora".
- Card KPI grande: `Guias encontradas` = `guides.length` (número real, não "1,284"), ícone `FileText` no quadrado indigo. Formatação `pt-BR` via `Intl.NumberFormat`.
- Grid 2 col menor:
  - `Prontas` = `readyToSend.length`, barra progresso esmeralda proporcional a `readyToSend/guides` (ou 0 se `guides=0`).
  - `Pendências` = `pendingContact.length`, barra rose proporcional.

Remover: os três divs de telemetria antigos (`guide-hero-telemetry`) e os chips laranja/verde antigos. A faixa `SummaryCard` logo abaixo do hero permanece inalterada — o hero passa a mostrar KPIs de destaque e a faixa abaixo mantém o detalhamento (5 cards). Se ficar redundante, ajusto os 5 cards inferiores para não repetir os 3 do hero (remover "Guias encontradas", "Prontas para envio" e "Pendências de cadastro", mantendo apenas "Enviadas" e "Falhas/exceções"). **Decisão:** enxugar a faixa inferior para 2 cards para eliminar redundância.

## CSS auxiliar em `src/index.css`

- Nova classe `.guide-hero-shell` substituindo os visuais laranja/marrom da `.guide-hero` atual (bg `#0a0a1a`, sem gradient sépia). A classe antiga `.guide-hero` continua existindo para o modal de contato (usa a mesma classe). Solução: renomear no hero para `.guide-hero-shell` e manter `.guide-hero` no modal com estilo próprio ou criar variante `.guide-hero--modal`.
- `.guide-kpi-hero`, `.guide-kpi-hero-strong`, `.guide-kpi-progress--ready`, `.guide-kpi-progress--pending` — todos usando as variáveis novas.

## Fora de escopo
- Faixa abaixo do hero (seções `Pendências`, `Prontas`, `Guias encontradas`) — apenas ajuste dos 5 SummaryCards → 2, sem mexer no restante.
- Modal `ContactResolutionDialog`, lógica de scan, hooks, testes.
- Outras rotas.

## Validação
- `bunx tsgo --noEmit`
- `bunx vitest run` (garantir que 117 testes seguem verdes).
- Screenshot Playwright autenticado em 1440 e 390 px para conferir contraste e legibilidade.

Ao aprovar, aplico as mudanças em uma única rodada.
