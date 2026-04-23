

# Capturar download do PDF na SPA da Receita (CND)

## Contexto

A SPA já passa por `navigate_spa → select_pj → fill_cnpj_spa → solve_captcha_spa → submit_spa → wait_result_spa`. Falta capturar o **PDF** que o portal entrega após o submit (quando há sucesso) e salvá-lo como artefato no bucket `automation-artifacts`, igual já fazemos com screenshots.

## Decisões importantes

- **Captura paralela**: usamos `page.waitForEvent('download', { timeout: 30_000 })` **antes** do clique em submit, conforme pattern oficial do Playwright (a Promise tem que estar registrada antes do click, senão perde o evento).
- **Não substituir o parsing de DOM**: alguns resultados aparecem inline na SPA (positiva/negativa em HTML) sem download. Mantemos o parsing atual de `cnd_status` como fallback. Se vier PDF, é o caminho feliz; se não vier, caímos no parsing de texto que já funciona.
- **Storage**: reusar `requestArtifactUpload` + `uploadArtifactBytes` (helpers já existentes em `cloudflare-worker/src/lib/progress.ts`) para subir o PDF para o bucket `automation-artifacts` via signed URL. **Sem `/tmp` no Worker** — Cloudflare Worker não tem filesystem persistente; lemos os bytes do download via stream em memória.
- **Vincular ao resultado**: o `path` do PDF entra em `result.parsed_payload.certificate_pdf_path` e em `result.raw_payload.pdf_artifact_path`, para o `cf-final-callback` materializar em `cnd_lookup_results.certificate_pdf_url` quando aplicável.

## O que será feito

### 1. `cloudflare-worker/src/providers/cnd-spa-portal.ts`

Antes do bloco que clica em submit:

```ts
const downloadPromise = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
```

Após o submit, **paralelamente** ao `wait_result_spa` atual:

```ts
const download = await downloadPromise;
let pdfArtifactPath: string | null = null;
if (download) {
  await sendProgress(env, { job_id, step: "download_pdf_spa", message: "Recebendo PDF da certidão", provider: PROVIDER });
  // Lê o stream do download em memória (Worker não tem fs)
  const stream = await download.createReadStream();
  if (stream) {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const pdfBytes = concatUint8(chunks);
    if (pdfBytes.byteLength > 0) {
      const ticket = await requestArtifactUpload(env, {
        job_id, artifact_type: "certificate_pdf",
        filename: `cnd_${cnpjDigits}_${Date.now()}.pdf`,
        mime_type: "application/pdf",
      });
      if (ticket) {
        const ok = await uploadArtifactBytes(ticket.upload_url, pdfBytes, "application/pdf");
        if (ok) pdfArtifactPath = ticket.path;
      }
    }
  }
  await sendProgress(env, {
    job_id, step: "download_pdf_spa",
    status: pdfArtifactPath ? "success" : "warning",
    message: pdfArtifactPath ? "PDF salvo" : "PDF chegou mas upload falhou",
    details_json: { size_bytes: pdfBytes?.byteLength ?? 0, artifact_path: pdfArtifactPath },
  });
}
```

No `result` final, adicionar:

```ts
parsed_payload: { ..., certificate_pdf_path: pdfArtifactPath },
raw_payload: { ..., pdf_artifact_path: pdfArtifactPath },
```

E refinar lógica de status: se houver PDF e `cnd_status` ainda for `null`, marcar como `negativa` (default otimista quando portal entrega PDF — Receita só emite PDF para certidão válida). Se não houver PDF e nenhum marcador no DOM, manter `layout_changed: spa_result`.

Helper local `concatUint8(chunks)` para juntar os pedaços do stream.

### 2. `cloudflare-worker/src/providers/cnd-public-portal.ts` (legado)

Aplicar o mesmo pattern `waitForEvent('download')` no portal antigo — quando o legado é atingido pelo fallback, hoje só lê HTML; o legado também emite PDF e estamos perdendo.

### 3. `supabase/functions/cf-final-callback/index.ts`

Quando `parsed_payload.certificate_pdf_path` existir, gravar `cnd_lookup_results.certificate_pdf_url = parsed_payload.certificate_pdf_path` (caminho relativo no bucket — a UI já assina via `artifacts-sign`).

### 4. `src/features/consulta/components/CndResultCard.tsx`

Pequeno ajuste: se `certificate_pdf_url` (já existe no schema) estiver presente, mostrar botão **"Baixar PDF"** que chama `artifacts-sign` para obter URL assinada. Já existe `ArtifactViewer.tsx` — reusar.

### 5. Bump `BUILD_ID` no Worker

`cloudflare-worker/src/index.ts` → `"2026-04-23-spa-pdf-download-v1"`

## Arquivos alterados

**Cloudflare Worker (precisa `wrangler deploy`):**
- `cloudflare-worker/src/providers/cnd-spa-portal.ts` — captura download + upload artefato
- `cloudflare-worker/src/providers/cnd-public-portal.ts` — mesmo pattern para legado
- `cloudflare-worker/src/index.ts` — BUILD_ID

**Edge Functions (deploy automático Lovable):**
- `supabase/functions/cf-final-callback/index.ts` — persiste `certificate_pdf_url`

**App:**
- `src/features/consulta/components/CndResultCard.tsx` — botão "Baixar PDF" quando disponível

## Sem mudanças em
- HMAC, secrets, bindings, callback_base
- Lógica de captcha/OCR (continua igual)
- Provider CNPJ (já aprovado)
- Storage bucket / RLS (`automation-artifacts` já existe e suporta `certificate_pdf` como `artifact_type`)

## Por que não exatamente como você sugeriu

- `download.saveAs("/tmp/...")` — **não funciona no Cloudflare Worker** (sem filesystem). Usamos `createReadStream()` em memória.
- `page.waitForTimeout(2000)` — anti-pattern; `waitForEvent('download')` já bloqueia até o download começar; o `wait_result_spa` atual cobre o resto.
- `waitForEvent` **antes** do click (não depois) — caso contrário perdemos eventos rápidos.

## Deploy necessário

**SIM:**

```bash
cd cloudflare-worker && npx wrangler deploy
curl -s https://gestaoez.leomateus620.workers.dev/health | jq .build_id
# esperado: "2026-04-23-spa-pdf-download-v1"
```

## Resultado esperado

- Dry-run CND com sucesso → `cnd_lookup_results.certificate_pdf_url` populado → botão "Baixar PDF" aparece em `/consulta` para o resultado.
- Timeline mostra novo passo `download_pdf_spa` com tamanho do arquivo em `details_json`.
- Se o portal não emitir PDF (positiva/erro), fluxo continua via parsing de DOM como hoje — zero regressão.

