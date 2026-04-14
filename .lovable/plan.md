

# Fix Contrast & Color Strength Across All Pages

## Problem
The `text-muted-foreground` color (`220 9% 46%` light / `220 9% 55%` dark) combined with glass card transparency (`0.7` opacity) makes secondary text appear washed out and hard to read, especially at small font sizes (`10-11px`).

## Solution — Two-Layer Fix

### 1. Strengthen CSS Design Tokens (`src/index.css`)
- **`--muted-foreground`**: Light `46% → 36%`, Dark `55% → 65%` — stronger base for all secondary text
- **`--glass-bg`**: Opacity `0.7 → 0.85` — more opaque card backgrounds for better text contrast
- **`--glass-border`**: Opacity `0.8 → 0.9` — sharper card edges
- **`--glass-highlight`**: Slight reduction to avoid washing out top-edge content

### 2. Upgrade Text Colors in All Pages
Replace `text-muted-foreground` with `text-foreground/70` for important secondary info (company names in sub-lines, dates, metadata) while keeping `text-muted-foreground` only for truly tertiary content (labels, hints).

**Files to update (all pages + key components):**
- `src/index.css` — token adjustments
- `src/pages/Dashboard.tsx` — log details, chart legends, alert descriptions, metric sub-labels
- `src/pages/Empresas.tsx` — razão social, CNPJ, location, regime labels
- `src/pages/EmpresaDetalhe.tsx` — header info (email, phone, location), checklist dates, doc metadata, log details
- `src/pages/Agenda.tsx` — vencimento dates, timeline sub-text
- `src/pages/Certidoes.tsx` — emission/vencimento dates, responsável
- `src/pages/Documentos.tsx` — empresa name, tipo, size, dates in both list/grid views
- `src/pages/Envios.tsx` — destinatário, datetime, doc count, mensagem
- `src/pages/Logs.tsx` — date headers, user names, action labels, timestamps
- `src/pages/Alertas.tsx` — descrição, empresa name, dates
- `src/pages/Configuracoes.tsx` — section descriptions
- `src/components/MetricCard.tsx` — title label color
- `src/components/SectionHeader.tsx` — if uses muted
- `src/components/PageHeader.tsx` — subtitle
- `src/components/EmptyState.tsx` — description text

### Specific Pattern
- Primary data (names, titles): keep `text-foreground` / `font-medium`
- Important secondary (dates, CNPJ, locations, metadata): upgrade to `text-foreground/65`
- Tertiary (hints, counters, labels): keep `text-muted-foreground` (which is now stronger)
- Dot separators, icons: `text-foreground/40`

