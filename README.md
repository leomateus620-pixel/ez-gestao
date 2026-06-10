# EZ Gestão

EZ Gestão é uma aplicação operacional para escritórios contábeis centralizarem rotinas de atendimento, documentos, guias, automações e análises fiscais em uma interface web conectada ao Supabase e validada no Lovable.

## Principais módulos

- **Guias**: fila operacional de guias recebidas, enviadas, exceções e integrações de captura/envio.
- **Empresas**: cadastro e acompanhamento de clientes, responsáveis, canais de contato e documentos vinculados.
- **Integrações**: status e configuração operacional de conectores como Google Drive, Gmail e WhatsApp/Twilio.
- **Fator R**: processamento, cálculo e monitoramento mensal do Fator R, com apoio de documentos e logs.
- **Reforma Tributária**: workspace guiado para cadastro de empresa, questionário, upload de documentos, score, parecer manual, decisão final e histórico por ano-base.
- **Classifica**: classificação automática/assistida de notas fiscais, itens, regras, fila de revisão, logs e sincronização com Drive.
- **WhatsApp**: acompanhamento administrativo de mensagens e integrações relacionadas ao canal WhatsApp.

## Stack

- React
- Vite
- TypeScript
- Supabase
- Lovable
- Vitest
- Playwright
- Tailwind CSS
- TanStack Query

## Como rodar localmente

Pré-requisitos recomendados:

- Node.js em versão LTS recente.
- npm disponível.
- Variáveis de ambiente configuradas em `.env.local` a partir de `.env.example`.

```bash
npm install
npm run dev
```

A aplicação Vite ficará disponível no endereço informado pelo terminal, normalmente `http://localhost:5173`.

## Scripts úteis

```bash
npm install          # instala dependências
npm run dev          # inicia o servidor local Vite
npm run build        # gera build de produção
npm run test         # roda testes unitários com Vitest
npm run test:e2e     # roda testes E2E com Playwright
npm run lint         # roda ESLint do projeto
```

## Variáveis de ambiente

Crie um `.env.local` com base em `.env.example`. Não versione valores reais, tokens, service role keys ou secrets.

Variáveis esperadas no frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_FATOR_R_EMAIL_DRY_RUN`
- `VITE_FATOR_R_DRIVE_FOLDER_ID`

## Fluxo Codex vs Lovable

- **Codex**: usado para alterações de código, refatorações, testes automatizados, documentação, ajustes em migrations versionadas no repositório e abertura de PR.
- **Lovable**: usado para validar o ambiente real conectado ao Supabase Cloud, Storage, Edge Functions, preview visual, autenticação real e publicação/cloud.

Quando houver dúvida entre um comportamento local mockado e o comportamento real do backend, valide no Lovable/Supabase antes de considerar a alteração como pronta para produção.

## Cuidados com migrations

Arquivos SQL dentro de `supabase/migrations` documentam e versionam mudanças esperadas no banco, mas **não significam que a migration já foi aplicada no Supabase Cloud**.

Antes de validar features que dependem de schema, índices, policies, Storage ou Edge Functions, confirme no Lovable/Supabase real se a migration foi aplicada. Este repositório não deve guardar secrets nem alterar diretamente policies reais sem uma validação operacional planejada.

## Testes e validação

Para uma validação completa antes de PR:

```bash
npm run build
npm run test
npm run lint
npm run test:e2e
```

Se o lint geral apontar débitos antigos, valide pelo menos os arquivos alterados com `npx eslint` e registre a limitação no resumo da PR.
