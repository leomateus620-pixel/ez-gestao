

# Corrigir provider CND no Worker (layout atual do portal)

## Diagnóstico

Hoje o `runCndLookup` faz:
1. `goto("/Servicos/certidaointernet/PJ/Emitir")`
2. procura `input[name="NI"]` ou `input[name="cnpj"]`
3. clica no primeiro `input[type="submit"]`

O portal atual da Receita **mudou**. A página `/Emitir` é a landing institucional com botão "Emitir Certidão" que leva ao formulário real. O input do CNPJ no formulário atual usa `id="NI"` dentro de um `<form action="emitir.aspx">`, e há uma etapa intermediária. Por isso o seletor cai e cai como `layout_changed`.

## O que será feito

### 1. Reescrever `cloudflare-worker/src/providers/cnd-public-portal.ts`

Fluxo novo:

1. **navigate**: `goto` na landing (`/PJ/Emitir`), captura screenshot `cnd_step1_landing`.
2. **enter_form**: detectar e clicar no link/botão "Emitir Certidão" (seletores em cascata: `a:has-text("Emitir Certidão")`, `button:has-text("Emitir")`, `a[href*="emitir"]`). Se não houver, considerar que já está no formulário.
3. **fill_cnpj**: tentar seletores em ordem — `#NI`, `input[name="NI"]`, `input[name="cnpj"]`, `input[type="text"]`. Preencher com `payload.cnpj` (apenas dígitos).
4. **submit**: tentar `button:has-text("Consultar")`, `input[type="submit"][value*="Consultar"]`, `#btnConsultar`, `input[type="submit"]`.
5. **wait_result**: `waitForLoadState("networkidle")` com fallback `domcontentloaded` + `waitForSelector` em qualquer um dos marcadores conhecidos da página de resultado: `text=/CERTID[ÃA]O/i`, `text=/c[oó]digo de controle/i`, `text=/n[ãa]o consta/i`, `text=/captcha/i`, timeout 30s.
6. **detect_captcha**: se aparecer `captcha|recaptcha|hcaptcha|"não sou um robô"` → `throw new Error("captcha")` (vai virar `captcha_detected` → `manual_required`).
7. **parse**: regex já existentes + novos marcadores do layout atual:
   - `cnd_status`:
     - `/positiva com efeitos de negativa/i` → `positiva_com_efeitos`
     - `/negativa de d[ée]bitos|certid[ãa]o negativa/i` → `negativa`
     - `/positiva/i` → `positiva`
     - `/n[ãa]o (consta|foi poss[íi]vel)/i` → `nao_emitida`
   - `certificate_number`: `/c[óo]digo de controle[^A-Z0-9]*([A-Z0-9.\-]{6,})/i`
   - `valid_until`: `/v[áa]lida at[ée]\s*(\d{2}\/\d{2}\/\d{4})/i`
   - `issued_at`: `/emitida em\s*(\d{2}\/\d{2}\/\d{4})/i` (usar quando presente; senão fallback `new Date().toISOString()`)
8. **classify_layout_changed**: se nenhum marcador foi encontrado E não houve captcha, lançar `Error("layout_changed: no known markers in result page")`. Isso garante classificação explícita em vez de cair como sucesso vazio.
9. screenshots em cada etapa: `cnd_step1_landing`, `cnd_step2_form`, `cnd_step3_result`.
10. progress events em cada etapa para aparecer no timeline da UI.

### 2. Garantir classificação explícita

`cloudflare-worker/src/lib/classification.ts` já trata:
- `captcha` → `captcha_detected`
- `selector|element not found|waiting for` → `layout_changed`

Adicionar mais um padrão para o erro novo que o provider lança:
- `/layout_changed|no known markers/i` → `layout_changed`

### 3. UI / classificação no front

`src/features/consulta/services/classification.ts` já tem entradas para `captcha_detected`, `manual_required` e `layout_changed`. **Ajuste**: melhorar a sugestão de `layout_changed` para refletir que é o conector da CND que precisa de revisão (não "equipe técnica" genérico):

- `layout_changed.suggestion` → "O layout do portal CND mudou. O conector precisa ser atualizado. Reporte ao time técnico com o screenshot da etapa final."

E `captcha_detected.suggestion` reforçado:
- "Receita exigiu captcha. Tente novamente em 5–10 min ou faça consulta manual em solucoes.receita.fazenda.gov.br."

### 4. Garantir que o relatório do dry-run mostra os dois corretamente

Validado em `ConsultaSaude.tsx`: já renderiza `cnpjErr/cnpjErrMsg` e `cndErr/cndErrMsg` via `describeError()`. Sem mudança aqui.

## Arquivos alterados

**Cloudflare Worker (precisa `wrangler deploy`):**
- `cloudflare-worker/src/providers/cnd-public-portal.ts` — rewrite completo do fluxo
- `cloudflare-worker/src/lib/classification.ts` — adicionar padrão `layout_changed|no known markers`
- `cloudflare-worker/src/index.ts` — bump `BUILD_ID` para `"2026-04-23-cnd-layout-fix-v1"`

**App (deploy automático):**
- `src/features/consulta/services/classification.ts` — sugestões mais específicas para `layout_changed` e `captcha_detected`

CNPJ não é alterado: `captcha_detected` → `manual_required` já é o comportamento correto.

## Deploy necessário

**SIM**, você vai precisar rodar de novo:

```bash
cd cloudflare-worker
npm install
wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-cnd-layout-fix-v1"
```

Depois, dispare o dry-run em `/consulta/saude` e o resultado esperado é:
- **CNPJ**: `manual_required` / `captcha_detected` (mesmo comportamento — portal exige captcha mesmo)
- **CND**: `success` com `cnd_status` preenchido **OU** `layout_changed` com sugestão clara (sem cair em `unknown`)

## Restrições mantidas

- Não mexer em HMAC, secrets, bindings ou `CALLBACK_BASE_URL`
- Não mexer no provider CNPJ
- Foco exclusivo: provider CND + classificação + sugestões da UI

