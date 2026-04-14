

# Hardening Completo — Fase 1 CND Manager

## Overview
Strengthen the entire Phase 1 with robust data logic, validation, performance optimizations, proper state management, error handling, and automation-ready architecture.

## 1. Data Layer Hardening

**New: `src/hooks/useDataStore.ts`** — Centralized reactive data store using React context + useReducer
- Single source of truth for all entities (empresas, CNDs, docs, envios, alertas, logs)
- Actions: `ADD_EMPRESA`, `UPDATE_EMPRESA`, `ADD_CND`, `UPDATE_CND_STATUS`, `ADD_DOCUMENTO`, `ADD_ENVIO`, `RESOLVE_ALERTA`, `MARK_ALERTA_LIDO`, `ADD_LOG`
- Auto-recalculates CND status on every mutation (calls `calcularStatusCND`)
- Auto-generates alerts when status changes (e.g., CND becomes "vencida" → create alert)
- CNPJ uniqueness check on empresa creation
- Date consistency validation (emissao < vencimento)
- Prevents duplicate document IDs and orphan references

**New: `src/data/DataProvider.tsx`** — Context provider wrapping the app, initializes from mockData

**Modified: `src/data/mockData.ts`** — Add more test scenarios:
- Empresa with 0 CNDs (id=10 Alpha already covers this partially — ensure it's complete)
- Empresa with all CNDs valid (id=8 Campo Verde)
- Empresa with all CNDs expired (add data for id=7 MetalNorte)
- Add version history to some documents (versao 1, 2, 3)

## 2. Status Calculation Engine

**Modified: `src/lib/status-utils.ts`** — Add:
- `recalcularTodosStatus(cnds)`: batch recalculate all CND statuses
- `gerarAlertasAutomaticos(cnds, alertasExistentes)`: derive alerts from CND state, avoiding duplicates
- `consolidarDashboard(empresas, cnds, docs, envios, logs)`: returns pre-computed dashboard metrics object
- `validarIntegridadeDados(store)`: checks for orphan references, missing required fields, inconsistent dates — returns array of warnings

**Modified: `src/lib/formatters.ts`** — Add:
- `validarDataVencimento(emissao, vencimento)`: ensures vencimento > emissao
- `sanitizeInput(value)`: trim + basic XSS protection for text inputs

## 3. Performance Optimizations

**All pages** — Replace direct `mockEmpresas`/`mockCNDItems` imports with `useDataStore()` hook:
- Memoize derived data with `useMemo` (already done in most pages — verify all)
- Memoize callbacks with `useCallback` for event handlers passed to children
- Add pagination to Empresas, Certidoes, Documentos, Envios, Logs (show 20 items per page with "Load More" or page controls)

**Modified: `src/pages/Dashboard.tsx`** — Use `consolidarDashboard()` instead of inline calculations scattered across the component. Memoize all derived arrays.

**Modified: `src/pages/Empresas.tsx`** — `getEmpresaResumo` is called per-render per-empresa inside `.map()`. Precompute all resumos in a single `useMemo` pass.

## 4. Validation & Error Handling

**New: `src/hooks/useConfirmAction.ts`** — Confirmation dialog hook for destructive actions (archive empresa, resolve all alerts, delete document)

**New: `src/components/ConfirmDialog.tsx`** — Reusable alert dialog for destructive action confirmation

**New: `src/components/ErrorBoundary.tsx`** — Page-level error boundary with retry button and styled error state

**Modified: All pages** — Wrap each page component in ErrorBoundary. Add try-catch to data operations.

**Modified: `src/pages/Empresas.tsx`** — "Nova Empresa" button opens a dialog/form with:
- CNPJ validation (already exists in formatters.ts) with real-time feedback
- CNPJ uniqueness check against existing empresas
- Required field validation (razaoSocial, nomeFantasia, cnpj, emailPrincipal)
- Email format validation
- Phone format validation
- On submit: creates empresa + auto-generates base checklist by regime

**Modified: `src/pages/EmpresaDetalhe.tsx`** — Quick action buttons actually work:
- "Upload PDF" opens file input (mock — stores in state, validates PDF type/size < 10MB)
- "Enviar Documentos" navigates to /envios with empresa pre-selected
- "Gerar Alerta" creates manual alert
- "Editar" opens edit form

## 5. Automation-Ready Architecture

**New: `src/hooks/useAlertEngine.ts`** — Alert generation engine:
- Runs on data store changes
- Rules: vencimento 7d, 3d, 1d, today, vencido, sem PDF, checklist incompleto
- Deduplication by (empresaId + cndItemId + tipo)
- Returns generated alerts to store

**New: `src/hooks/useAgendaEngine.ts`** — Agenda consolidation:
- Derives agenda items from all CNDs with vencimento dates
- Groups and sorts by urgency
- Provides pre-computed counts

**New: `src/lib/queue.ts`** — Simple in-memory queue structure for future automated sends:
- `EnvioQueue` interface with `add`, `process`, `retry`, `getStatus`
- Currently processes immediately (mock), but structure is ready for async

## 6. State Management & Loading States

**New: `src/components/LoadingSkeleton.tsx`** — Skeleton variants for:
- MetricCard skeleton
- List row skeleton  
- Card skeleton
- Timeline skeleton

**Modified: All pages** — Add proper loading/error/empty states:
- `isLoading` state with skeleton loaders (simulated 300ms delay on initial render for demo)
- Error state with retry
- Empty state (already exists — verify all pages have it)
- Partial state (e.g., empresa with some CNDs loaded but others pending)

## 7. Audit Trail & Observability

**Modified: `src/data/types.ts`** — Add:
- `AuditEntry` interface: `{ id, timestamp, userId, action, entityType, entityId, before, after, metadata }`
- Add `auditTrail` array to data store

**Modified: `src/hooks/useDataStore.ts`** — Every mutation creates an audit entry automatically

**Modified: `src/pages/Logs.tsx`** — Add "Audit Trail" tab showing all system mutations with before/after diffs

## 8. File Upload Validation (Mock)

**New: `src/lib/file-validation.ts`**:
- `validatePDF(file)`: checks type (application/pdf), size (< 10MB), name sanitization
- `validateFileExtension(name)`: whitelist of allowed extensions
- Returns structured error messages

## 9. Toast Notifications & Feedback

**Modified: All pages with actions** — Add toast notifications for:
- Empresa created/updated successfully
- CND status changed
- Document uploaded
- Envio sent
- Alerta resolved/marked read
- Validation errors

## 10. Security Preparations

**New: `src/lib/permissions.ts`**:
- `UserRole` type: `'admin' | 'operador'`
- `canPerform(role, action)`: permission matrix
- Actions: `create_empresa`, `delete_empresa`, `upload_doc`, `send_envio`, `resolve_alerta`, `view_logs`, `manage_settings`
- Currently returns true for all (mock), but structure is ready for real auth

## Files Summary

**New files (8):**
- `src/hooks/useDataStore.ts`
- `src/data/DataProvider.tsx`
- `src/hooks/useAlertEngine.ts`
- `src/hooks/useConfirmAction.ts`
- `src/components/ConfirmDialog.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/LoadingSkeleton.tsx`
- `src/lib/file-validation.ts`
- `src/lib/permissions.ts`

**Modified files (14):**
- `src/App.tsx` — Wrap with DataProvider + ErrorBoundary
- `src/lib/status-utils.ts` — Add batch recalculation, alert generation, dashboard consolidation
- `src/lib/formatters.ts` — Add date/input validation
- `src/data/types.ts` — Add AuditEntry, EnvioQueue interfaces
- `src/data/mockData.ts` — Enrich test scenarios
- `src/pages/Dashboard.tsx` — Use consolidated metrics, memoize all
- `src/pages/Empresas.tsx` — Add create form, pagination, precompute resumos
- `src/pages/EmpresaDetalhe.tsx` — Wire up quick actions, add confirmations
- `src/pages/Certidoes.tsx` — Add pagination
- `src/pages/Documentos.tsx` — Add pagination, file validation
- `src/pages/Envios.tsx` — Add pagination
- `src/pages/Alertas.tsx` — Use data store, add confirmation for bulk actions
- `src/pages/Logs.tsx` — Add audit trail tab, pagination
- `src/pages/Configuracoes.tsx` — Add permission info

