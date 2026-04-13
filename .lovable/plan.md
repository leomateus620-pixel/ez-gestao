

# Refinamento Premium — Sistema CND Manager

## Scope
Deep visual and UX refinement across all screens, components, and the design system to achieve a proprietary, enterprise-grade SaaS appearance.

## 1. Design System Overhaul

**index.css** — Refine the glass system and add new utility layers:
- Add noise/grain texture overlay to glass cards via CSS pseudo-element (subtle SVG noise pattern)
- Introduce `--glass-highlight` token for top-edge shimmer on cards
- Add `animate-slide-in` and `animate-pulse-soft` keyframes (currently referenced but missing)
- Refine `.metric-card` with fixed min-height for consistent card alignment
- Add `.glass-card-elevated` variant with stronger shadow for priority sections
- Create `.filter-bar` component class with inner glow and subtle inset shadow
- Add transition utilities for hover states (scale, shadow, border-glow)

**tailwind.config.ts** — Add custom colors (`success`, `warning`, `info`) to theme, keyframes for `slide-in`, `fade-in`, `pulse-soft`, and custom font family for `JetBrains Mono` as `font-mono`.

## 2. Component Refinements

**GlassCard** — Add `variant` prop: `default | elevated | subtle | critical`. Each variant has distinct shadow depth, border opacity, and optional colored left-border accent. Add noise texture overlay.

**MetricCard** — Redesign: fixed height (`h-[120px]`), icon moved to top-right with larger rounded container, value font size increased to `text-3xl`, subtle animated gradient underline when hovered, add sparkline placeholder area.

**StatusBadge** — Add animated pulse dot for `vencida`/`critica` statuses. Refine border-radius to pill shape. Slightly increase padding for better touch targets.

**AppSidebar** — Add gradient accent line on active item left edge. Refine spacing between items. Add subtle separator lines between menu groups. Improve logo area with gradient background. Add hover animation on menu items.

**AppLayout** — Refine header: add breadcrumb area, subtle bottom-border gradient, search command palette trigger (Cmd+K style button). Improve user avatar section with dropdown indicator.

## 3. Dashboard Refinement

Restructure layout into clear visual zones:

```text
+--------------------------------------------------+
| Metrics Row (6 cards, fixed height, aligned)      |
+--------------------------------------------------+
| Status Chart (1/3)  | Urgent Actions (2/3)        |
|                     | - better row design           |
|                     | - progress indicator per item |
+--------------------------------------------------+
| At-Risk Companies   | Recent Activity Timeline      |
| (new section)       | (new section)                 |
+--------------------------------------------------+
| Active Alerts (full width, refined cards)         |
+--------------------------------------------------+
```

- Add "At-Risk Companies" block: top 4 companies with worst document health, mini progress bar showing % valid
- Add "Recent Activity" block: last 5 log entries in mini-timeline format
- Redesign urgent actions rows with left color-bar accent, better spacing, countdown badge
- Add quick action buttons row: "Novo Upload", "Enviar Documentos", "Ver Agenda"
- PieChart: add center label showing total count, use custom colors matching design tokens

## 4. Empresas Listing Refinement

- Convert cards to a table-card hybrid: consistent row height, alternating subtle backgrounds
- Add column-like alignment: company info (left), CND health mini-bar (center), status indicators (right)
- Health mini-bar: horizontal stacked bar showing red/yellow/green proportions
- Add sort controls in header area (by name, status, # vencidas)
- Improve empty state with illustration and CTA
- Add pagination component at bottom

## 5. Empresa Detalhe Refinement

- Redesign header as hero section: larger, with gradient background accent, health score ring (circular progress showing % valid CNDs)
- Quick actions toolbar below header: Upload PDF, Send Documents, Generate Alert, Edit Company
- Tabs: add count badges, better visual treatment with underline style instead of default
- Checklist tab: group by CND type with collapsible sections, add progress bar per group
- Documents tab: grid view option alongside list view
- Logs tab: improved timeline with colored nodes, action icons, and better spacing
- Add "Document Health Summary" sidebar card on desktop

## 6. Agenda Refinement

- List view: add date group headers ("Vencidos", "Hoje", "Proximos 3 dias", "Proximos 7 dias", "Validos")
- Calendar: highlight dates with color-coded dots (red/yellow/green), show event count on each day
- Timeline: add date markers, improve card design within timeline nodes
- Add summary bar at top showing counts per urgency level

## 7. Certidoes, Documentos, Envios Pages

- Certidoes: add summary counter bar (X validas, Y vencendo, Z vencidas) above filter
- Documentos: add grid/list view toggle, file type icon variations, storage usage indicator
- Envios: add channel icon differentiation (email blue, WhatsApp green), delivery status timeline per envio

## 8. Alertas Refinement

- Priority grouping with section headers ("Criticas", "Alta", "Media")
- Add snooze button with time picker
- Improve resolved state with strikethrough-like visual
- Add bulk actions: "Mark all as read", "Resolve all"

## 9. Logs Refinement

- Better timeline nodes: larger, color-coded by action type
- Add user avatar circles on timeline nodes
- Add "no access" warning indicators for companies that never opened documents
- Add date group separators in timeline

## 10. Microinteractions & Polish

- Add `framer-motion` (or CSS-only) transitions for page route changes
- Hover states: cards lift with shadow increase, border brightens
- Click feedback: subtle scale-down on buttons
- Loading skeletons matching each card type shape
- Empty states: custom illustrations per module, helpful CTAs
- Toast notifications styled to match glass theme
- Smooth filter transitions (no layout jumps)

## 11. Responsiveness Refinement

- Mobile sidebar: improve drawer with swipe gesture support
- Mobile metric cards: 2-column grid with proper spacing
- Mobile tables/lists: card-based layout with swipe actions
- Mobile filters: collapsible filter bar or bottom sheet
- Tablet: 2-column dashboard layout, side-by-side chart+actions

## Files to Create/Modify

**Modified:**
- `src/index.css` — Design tokens, glass refinements, new component classes
- `tailwind.config.ts` — Colors, keyframes, animations, fonts
- `src/components/GlassCard.tsx` — Variants, texture overlay
- `src/components/MetricCard.tsx` — Redesigned layout, fixed height
- `src/components/StatusBadge.tsx` — Pulse animation, refined styles
- `src/components/AppSidebar.tsx` — Visual polish, active states
- `src/components/AppLayout.tsx` — Header refinement, breadcrumbs
- `src/pages/Dashboard.tsx` — New sections, restructured layout
- `src/pages/Empresas.tsx` — Health bar, sorting, pagination
- `src/pages/EmpresaDetalhe.tsx` — Hero header, health ring, improved tabs
- `src/pages/Agenda.tsx` — Date grouping, summary bar
- `src/pages/Certidoes.tsx` — Summary counters
- `src/pages/Documentos.tsx` — Grid toggle, file icons
- `src/pages/Envios.tsx` — Channel styling, status timeline
- `src/pages/Alertas.tsx` — Priority grouping, bulk actions
- `src/pages/Logs.tsx` — Improved timeline, date separators
- `src/pages/Configuracoes.tsx` — Visual polish

**New:**
- `src/components/HealthBar.tsx` — Stacked bar showing CND health distribution
- `src/components/HealthRing.tsx` — Circular progress for empresa detail
- `src/components/QuickActions.tsx` — Dashboard quick action buttons
- `src/components/EmptyState.tsx` — Reusable empty state with icon, title, description, CTA
- `src/components/SectionHeader.tsx` — Consistent section headers with action buttons
- `src/components/FilterBar.tsx` — Refined filter bar component
- `src/components/PageHeader.tsx` — Consistent page header with title, subtitle, actions

