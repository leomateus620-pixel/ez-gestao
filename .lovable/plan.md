## Diagnóstico — por que o WhatsApp não disparou

Consultei o banco. As duas guias da imagem têm status que **bloqueiam envio por design** — o problema não está no WhatsApp em si:

| Guia | Status real | Motivo registrado |
|---|---|---|
| 1ª (14:45) | `duplicada` | "Duplicidade exata por hash de arquivo" — é o mesmo PDF reprocessado |
| 2ª (14:18) FGTS | `nao_identificada` | "CNPJ invalido no PDF" — barrada **antes** do fallback por razão social |

Secrets do WhatsApp (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEST_TO`) estão configurados, e `guide_test_config` está em `modo_global=producao`. Ou seja, o pipeline dispararia — mas nenhuma das duas guias chegou no estágio de envio.

**Causa raiz da 2ª guia (a única "salvável"):** no `routeGuide`, a checagem `cnpj.status === "invalid"` (linha 411) retorna `nao_identificada` **antes** do fallback FGTS por razão social. O fallback só roda para `status !== "valid"` na linha 416, mas nunca é alcançado porque o early-return já disparou. O "21.205.304" parcial do GFD é classificado como inválido (não como missing), por isso cai no ramo errado.

## Plano

### 1. Corrigir fallback FGTS por razão social (root cause do não-envio)
**`supabase/functions/run-guide-scan-now/index.ts` — `routeGuide`:**
- Antes do early-return de `cnpj.status === "invalid"`, computar `fgtsEmployerMatched` e pular o bloqueio quando `tipo === "fgts" && matched && razao_social válida`. Mesma lógica já existente para `"missing"`, estendida para `"invalid"`.
- Garantir que `matchCompanyForFGTSGuide` rode mesmo com CNPJ inválido (verificar que `matched` é populado a partir do nome quando o CNPJ não bate). Se hoje só roda no caminho missing, replicar para invalid usando o documento parcial classificado como `documento_parcial`.
- `critical_fields_json.match_method` continua registrando o método (`exact_normalized_legal_name`, etc.) para auditoria.

Resultado esperado: guia FGTS com CNPJ parcial + razão social única → vira `pronta_envio` e dispara WhatsApp para `whatsapp_principal` da empresa (modo produção).

### 2. Excluir guias do Fluxo recente
**Backend** — nova edge function `delete-guia`:
- Recebe `{ guia_id }`, exige auth.
- Apaga linhas de `guia_envios`, `guia_eventos`, `guia_exceptions` ligadas; remove arquivo do Storage (bucket de PDFs) se houver `storage_path`; deleta `guias`.
- Loga `guia_eventos` em tabela `guia_audit_log` (registro de exclusão com user_id + motivo opcional).
- Permitido para qualquer status (não só duplicada/erro), pois é ação manual operador.

**Frontend** — `src/pages/Dashboard.tsx` (`Fluxo recente`):
- Adicionar botão ícone "lixeira" (ghost, ao lado do `ChevronIcon`) em cada `guide-flow-row`.
- Click abre `AlertDialog` shadcn ("Excluir guia X? Esta ação remove arquivo, eventos e histórico.").
- Confirmação chama `useMutation` que invoca a edge function e invalida `['guias']`.
- Não navega ao detalhe quando o clique é no botão (stopPropagation).
- Mesmo botão na lista `/guias/fila` (`src/pages/guias/Guias.tsx`) e na página de detalhe (`GuiaDetalhe.tsx`), reutilizando o mesmo hook `useDeleteGuide` em `useGuideOps.ts`.

### 3. Auditoria e mensagens
- `decision_reason` da 2ª guia será atualizado para refletir o caminho FGTS quando reprocessada (não há migração retroativa — basta clicar "Processar agora" depois do fix; ou usar o botão excluir e reenviar o PDF).
- Documentar no `docs/guias-automation.md`: novo comportamento do fallback para CNPJ inválido + endpoint `delete-guia`.

### 4. Fora de escopo
- Mudanças no parser GFD (já feito turno anterior).
- Mudança no pipeline de envio WhatsApp em si (funciona; verificado pelos secrets).
- Reprocessar automaticamente guias antigas.

## Critérios de aceite
- Botão de excluir aparece e funciona no Fluxo recente, lista da fila e detalhe.
- Após exclusão, a guia some das listas sem refresh manual.
- Guia FGTS com CNPJ parcial + razão social única em empresa ativa: ao clicar "Processar agora" vira `pronta_envio` e dispara WhatsApp/e-mail para a empresa.
- Guia FGTS com razão social ambígua continua em `revisao_manual`.
- Build e testes existentes (`fgts-digital.test.ts`, `guide-rules.test.ts`) passam.
