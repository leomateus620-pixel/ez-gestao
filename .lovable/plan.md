## Objetivo
Revisar e corrigir a ortografia e acentuação do português em todo o projeto (textos visíveis ao usuário), sem alterar lógica, nomes de variáveis, chaves de API, identificadores técnicos ou strings usadas como enums/keys.

## Escopo

**Incluído (texto exibido ao usuário):**
- Páginas em `src/pages/**` (Dashboard, Empresas, Agenda, Alertas, Certidões, Documentos, Envios, Exceções, Execuções, Integrações, Logs, Configurações, FatorR, Classifica, WhatsApp, Login, NotFound, guias/*, consulta/*).
- Componentes em `src/components/**` e `src/navigation/**` (labels, tooltips, placeholders, mensagens de erro/sucesso, toasts).
- Registro de menu (`src/navigation/menu-registry.ts`) — apenas `label`, `shortDescription`, `a11yLabel`, `quickActions[].label`.
- Hooks e libs com mensagens visíveis (`useAlertEngine`, `useAgendaEngine`, `useConfirmAction`, `formatters`, `status-utils`).
- Mensagens de validação em `src/features/guias/**` e `src/features/consulta/**`.
- Mensagens de erro/sucesso retornadas por Edge Functions em `supabase/functions/**` quando exibidas ao usuário (campos `error`, `message`).
- Comentários em PT-BR nos arquivos acima (correção opcional, só se claramente errados).
- Documentação em `docs/**` (acentuação faltando: "automacao" → "automação", "excecoes" → "exceções", etc.).
- `README.md`, `index.html` (title, meta description).

**Excluído (não tocar):**
- `src/integrations/supabase/types.ts`, `src/integrations/supabase/client.ts`, `.env`.
- Migrações em `supabase/migrations/**` (read-only).
- Nomes de tabelas, colunas, enums, status (`pending`, `safe`, `attention`, `critical`, `vencida`, `vencendo`, etc. — são chaves).
- IDs de menu, rotas, chaves de tradução, nomes de eventos/ações de log.
- Código de terceiros, `cloudflare-worker/**` (inglês).
- Memórias (`mem://**`).

## Abordagem

1. **Levantamento automatizado**: rodar buscas (`rg`) por padrões de erros comuns:
   - Palavras sem acento frequentes: `automacao`, `excecao`, `excecoes`, `integracao`, `integracoes`, `configuracao`, `configuracoes`, `acao`, `acoes`, `historico`, `relatorios`, `analise`, `analitico`, `criterio`, `proximo`, `ultimo`, `ultimos`, `usuario`, `usuarios`, `pagina`, `paginas`, `numero`, `codigo`, `periodo`, `metrica`, `metricas`, `dinamica`, `referencia`, `transmissao`, `emissao`, `revisao`, `decisao`, `descricao`, `informacao`, `informacoes`, `validacao`, `manutencao`, `notificacao`, `notificacoes`, `confirmacao`, `cancelamento`, `processamento`, `vencimento`, `documento` (esse já correto), `e-mail`, `nao`, `sao`, `esta`/`está`, `ja`, `voce`, `pos`, `pre`, `tres`, `area`, `ativacao`, `instalacao`, `funcao`, `funcoes`, `sessao`, `sucesso`, `obrigatorio`, `automatica`, `automatico`, `publico`, `tecnico`, `basico`, `unico`, `pratico`, `proprio`, `medio`, `minimo`, `maximo`, `multiplo`, `previo`, `sintese`, `cronograma`, `diagnostico`, `estatistica`.
   - Erros gramaticais comuns: concordância, pontuação ausente, anglicismos desnecessários.
2. **Triagem**: separar ocorrências em "texto visível" vs "identificador técnico". Apenas as primeiras serão corrigidas.
3. **Aplicação em lotes por diretório**, com edições cirúrgicas (`apply_patch`), preservando estrutura JSX/strings.
4. **Verificação**: após cada lote, rodar `rg` novamente para confirmar correções e checar que nenhuma chave técnica foi alterada.
5. **QA visual rápido**: revisar páginas-chave (`/`, `/empresas`, `/guias/fila`, `/integracoes`, `/fator-r`, `/whatsapp`, `/configuracoes`) no preview para garantir que nada quebrou e os textos estão corretos.

## Entregáveis
- PT-BR corrigido em UI, mensagens, docs e metadados.
- Lista resumida no final do chat com a contagem de arquivos alterados por área (páginas, componentes, navegação, docs, edge functions).
- Nenhuma mudança em lógica, rotas, schema ou identificadores.

## Observações
- Mudanças puramente textuais; baixo risco de regressão.
- Em locais onde o termo for ambíguo (ex.: "status" vs "situação"), manter o termo já adotado pelo projeto.
- "CND", "CNPJ", "PGDAS", "Fator R", "WhatsApp", "Gmail", "Twilio", "Drive" permanecem como estão.
