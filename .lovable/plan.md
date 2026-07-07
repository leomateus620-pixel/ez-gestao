# Refinamento do módulo Envio de Guias (FABLE)

## Limitações do ambiente Lovable (importante ler antes de aprovar)

- Não consigo criar branch nomeada, fazer `push` para o GitHub nem abrir Pull Request a partir do Lovable. O controle de versão é gerenciado internamente e o resultado aparece como um commit no repositório sincronizado. Vou entregar todas as mudanças de código, testes e documentação; a abertura da PR precisa ser feita por você (ou eu descrevo exatamente o texto para colar).
- Testes visuais em `/guias` autenticado: só consigo validar via Playwright usando a sessão Supabase gerenciada. Vou capturar screenshots desktop/notebook/mobile e anexar.
- Repo-wide lint/typecheck: rodo, mas se houver dívida pré-existente não relacionada, documento e mantenho apenas os arquivos alterados limpos.

Confirme se posso seguir mesmo sem abertura de PR pelo agente. Se sim, executo o plano abaixo.

## Mapa do fluxo atual (após leitura de PR #39)

1. `/guias` renderiza `Guias.tsx` usando `GuideProvider` + `useGuideOps`.
2. CTA "Verificar guias no Drive" chama `run-guide-scan-now` via provider.
3. Edge function faz scan Drive → parser nativo PDF → decisão (`guide-rules`) → grava em `guias` + `guia_excecoes` + `guia_eventos`.
4. `contactPreconditionIssue` (backend) e `classifyGuideContactIssue` (frontend) classificam pendências de contato.
5. UI mostra seção "Pendências de cadastro" → modal `ContactResolutionDialog` → `useResolveGuideContact` atualiza/insere `empresas`, resolve exceções, dispara `dispatch-guide` com `manual_approval`.
6. `dispatch-guide` delega de volta a `run-guide-scan-now` com `force_dispatch`, que aplica pipeline seguro (templates, idempotência, canal preferido, modo teste/produção, Drive move).

## Problemas identificados na PR #39

1. **Divergência frontend/backend na classificação** — ordem de regras difere; o mesmo caso aparece como `missing_email` no front e `dispatch_precondition_failed` no back.
2. **Validação de telefone frouxa** — `normalizeBrazilianPhone` aceita `+[1-9]\d{7,14}` (qualquer país) mesmo com UI dizendo "WhatsApp/celular brasileiro". `isValidBrazilianPhone` é estrito, mas `hasValidGuidePhone` usa a normalização permissiva.
3. **Consentimento tratado como sinônimo de cadastro** — `useResolveGuideContact` pode marcar `whatsapp_opt_in_at`/`email_validado` ao salvar contato, sem opt-in real.
4. **Empresa criada como `ativa` + `simples_nacional` por padrão** — assunção arriscada; deveria ser `cadastro_incompleto` com flag.
5. **Modal não gerencia fila** — abre uma pendência mas não oferece "Resolver próxima"; risco de empilhar modais quando o usuário clica em várias.
6. **CTA "Confirmar forma de envio"** é ambíguo quando canal é `ambos` — não deixa claro se envia por e-mail, WhatsApp ou ambos.
7. **Dispatch dispara mesmo quando save de contato falha silenciosamente** — precisa `await` explícito e bloqueio se update falhar.
8. **Copy PT-BR** com termos sem acento em mensagens de exceção (`pendencia`, `nao`, `numero`) surfacing na UI.
9. **Cobertura de testes** — falta caso de canal `ambos` faltando um lado, telefone estrangeiro rejeitado, ausência de consent field, e ordem de fila.
10. **Layout `/guias`** — CTAs duplicados no header (verificar + processar), badges apertados em notebook (~1280px), modal com overflow em mobile <380px.

## Plano de refinamento em camadas

### Camada 1 — Regras de contato (frontend + backend alinhados)
- Endurecer `normalizeBrazilianPhone`/`isValidBrazilianPhone` (aceitar apenas `+55` com 10-11 dígitos após DDI, validar DDD 11-99, celular começando com 9).
- `hasValidGuidePhone` passa a usar `isValidBrazilianPhone`.
- Redefinir ordem canônica de classificação em `guide-contact-rules.ts` e replicar no backend `contactPreconditionIssue` de `run-guide-scan-now/index.ts`:
  1. missing_client
  2. missing_channel (empresa sem canal preferido)
  3. missing_contact_channels (sem e-mail e sem telefone)
  4. missing_email (canal exige e-mail)
  5. missing_phone (canal exige WhatsApp)
- Exportar helper compartilhável (mesma lógica em TS puro) para o edge function importar.

### Camada 2 — Persistência de contato/empresa
- `useResolveGuideContact`:
  - Nunca setar `whatsapp_opt_in_at`, `email_validado`, `verified_at`.
  - Se empresa nova: criar com `status: 'cadastro_incompleto'` + `regime_tributario: null` (add migration se coluna não aceitar).
  - `await` do update de contato antes de invocar `dispatch-guide`.
  - Se dispatch falhar, contato persiste mas toast informa "Contato salvo. Envio não realizado: <motivo>". Guia continua listada como pendente de dispatch, não de contato.
  - Audit log `guide_audit` com `action='contact_resolved'` + campos alterados.

### Camada 3 — Modal + fila de pendências
- Refatorar `ContactResolutionDialog` para receber `queue` e mostrar "Pendência X de N".
- Após save bem-sucedido: botão primário vira "Resolver próxima pendência" (auto-avança para próximo issue) ou "Concluir" se última.
- Bloquear abertura simultânea (state único `activeIssueId`).
- Mobile: `max-w-full sm:max-w-lg`, campos empilhados, footer sticky.
- Cancelar preserva issue na lista; nunca fecha silenciosamente com dispatch parcial.

### Camada 4 — Visual `/guias`
- Header: um único CTA primário ("Verificar guias no Drive"). Mover "Rodar teste" para menu secundário.
- Cards de resumo: quatro colunas com hierarquia consistente (Encontradas, Prontas, Pendências, Enviadas hoje).
- Seção "Pendências de cadastro" com badge de contagem e CTA "Resolver todas".
- Rows: densidade -12% padding vertical em notebook, badges com largura mínima.
- Empty/loading/error states dedicados com copy PT-BR.
- Sem novos tokens de design; usar `guide-*` classes existentes.

### Camada 5 — UX de canal
- CTA de envio explicita canal: "Enviar por e-mail", "Enviar por WhatsApp", "Enviar pelos dois canais" — deriva de `channelOptions(company)`.
- Se `canalPreferido='ambos'` e ambos válidos → botão único "Enviar pelos dois canais" + dropdown "Alterar canal desta guia".
- Backend recebe `channel_override` opcional em `dispatch-guide` (já suportado via overrides).

### Camada 6 — Copy PT-BR
- Auditoria completa das strings em `Guias.tsx`, `guide-contact-rules.ts`, exceptions surfacing, toasts em `useGuideOps.ts`.
- Alinhar aos rótulos padronizados listados na tarefa.

### Camada 7 — Testes
- Ampliar `guide-contact-rules.test.ts`:
  - telefones estrangeiros rejeitados;
  - celular BR sem 9 rejeitado;
  - canal `ambos` com um lado ausente → `missing_email`/`missing_phone`;
  - fila com múltiplas pendências → ordem estável.
- Novo `use-resolve-guide-contact.test.ts` (com msw ou mocks Supabase): garante que dispatch só é chamado após save OK e que campos de consent não são setados.
- Manter todos os testes existentes verdes.

## Fora de escopo (não vou mexer)
- Parser PDF (`_shared/guide-parser.ts`).
- Regras de dispatch/idempotência no `run-guide-scan-now` além do `contactPreconditionIssue`.
- Envio WhatsApp/Gmail (mantém Cloud API atual — não reintroduzo Twilio).
- Design system global.
- Módulos Fator R, Tax Reform, Classifica.

## Validação (Evidence)
- `npx tsc --noEmit`
- `npm run test -- src/features/guias`
- `npm run test`
- `npm run build`
- Playwright autenticado: screenshots de `/guias` em 1440, 1280 e 390 CSS px + modal aberto.
- Anexar tudo no resumo final com resumo dos diffs por arquivo.

## Entrega
- Commit único com mensagem: `Refina fluxo de envio de guias e pendências de contato`.
- Texto pronto de PR (Resumo, Mapa, Problemas, Correções, Arquivos, Alertas, Modal, Persistência, Reprocessamento, Canais, Testes, Validação visual, Limitações) para colar no GitHub, já que não posso abrir a PR pelo agente.

Confirma esse escopo? Se sim, sigo direto pelas 7 camadas.
