## Objetivo

Conectar **Google Drive** e **Gmail** ao projeto na tela **Integrações** (`/integracoes-guias`), reutilizando as conexões já existentes no workspace, e melhorar visualmente cada card colocando a logo oficial do provedor sobre a imagem/ícone do conector.

## Conexões reutilizadas

Já existem no workspace e serão linkadas ao projeto:

- `Drive Zimermann` (connector_id: `google_drive`)
- `Gmail Zimmermann` (connector_id: `google_mail`)

Nenhuma nova credencial será solicitada. Apenas o **link** ao projeto atual será feito via `standard_connectors--connect`.

## Mudanças

### 1. Linkar conectores ao projeto
- Linkar `google_drive` → expõe `GOOGLE_DRIVE_API_KEY` nas edge functions.
- Linkar `google_mail` → expõe `GOOGLE_MAIL_API_KEY` nas edge functions.

### 2. Atualizar a tela `IntegracoesGuias.tsx`
- Marcar Google Drive e Gmail como `status: 'conectado'` quando houver chave correspondente (heurística: render condicional baseada num novo edge function leve `check-connector-status` OU simplesmente refletir como conectado após o link, já que a verificação real virá na fase 2).
- Trocar o botão "Conectar Google OAuth" (atualmente desabilitado) para mostrar estado dos conectores Lovable.
- Em cada `ConnectorCard`:
  - Adicionar a logo oficial do provedor (Google Drive, Gmail, Twilio, Google Vision) **sobreposta** ao ícone atual (canto inferior-direito do bloco do ícone), em um badge circular com fundo branco/glass.
  - Manter o ícone lucide como base, com a logo PNG/SVG por cima.

### 3. Assets
Adicionar logos em `src/assets/connectors/`:
- `google-drive.svg`
- `gmail.svg`
- `twilio.svg`
- `google-vision.svg` (Google Cloud / Vision)

(SVGs oficiais dos brand kits — usados apenas como ícone, sem alteração.)

### 4. Edge function de verificação (opcional, leve)
`supabase/functions/integracoes-status/index.ts`:
- Retorna `{ google_drive: boolean, google_mail: boolean }` baseado em `Deno.env.get('GOOGLE_DRIVE_API_KEY')` e `GOOGLE_MAIL_API_KEY`.
- Chamado no mount de `IntegracoesGuias` para popular o status real.

## Fora de escopo

- Implementar o envio real de e-mails ou upload de arquivos via os conectores (já existe estrutura `scan-guide-folder`, `dispatch-guide` etc. que será migrada para usar o gateway numa próxima etapa).
- Configuração de pastas "a enviar" / "enviados" — fica para depois, mantendo o estado atual.

## Resultado esperado

- Cards de Google Drive e Gmail aparecem como **Conectado** após o link.
- Cada card mostra a logo oficial sobreposta ao ícone.
- Twilio e Google Vision continuam como estão, mas também ganham a logo sobreposta para consistência visual.
- Edge functions passam a ter `GOOGLE_DRIVE_API_KEY` e `GOOGLE_MAIL_API_KEY` disponíveis para uso futuro.
