# Fator R: fluxo unificado via pasta única no Drive

## Objetivo
Eliminar o cadastro manual de empresas e o anexo individual de PDFs. Uma única pasta no Drive (`PGDAS JULHO`) concentra todos os extratos PGDAS. No dia 20 de cada mês o sistema varre a pasta, interpreta cada PDF, identifica a empresa direto do extrato e mostra cards por empresa classificados em **Crítico**, **Atenção** ou **OK** — exibindo apenas nome, CNPJ e Fator R.

## Escopo da UI (/fator-r)
- Remover da tela:
  - Bloco "Envio automático de alertas" (cadastro de empresas + e-mails).
  - Botão "Anexar PDFs" e "Adicionar empresa".
  - Cards de detalhamento com RPA, RBT12, FS12, Anexo, DAS etc.
- Manter os cards de topo (Empresas / OK / Atenção / Crítico / Não se aplica) alimentados pela varredura.
- Nova seção "Resultado da varredura" com 3 colunas filtráveis (Crítico, Atenção, OK). Cada card mostra apenas:
  - Nome empresarial
  - CNPJ
  - Fator R (valor + faixa colorida)
- Botão "Rodar verificação agora" dispara varredura sob demanda (mesma função do cron).
- Data/hora da última varredura + total de PDFs lidos.

## Escopo do backend
- Nova pasta no Drive: `PGDAS JULHO` (nome configurável por secret `FATOR_R_INBOX_FOLDER_ID`; fallback ao `GOOGLE_DRIVE_FOLDER_ID` atual).
- Edge Function `fator-r-drive-sync` ajustada:
  - Ignora `fator_r_companies` como fonte de pastas; lê exclusivamente a pasta única.
  - Para cada PDF: extrai texto com `unpdf`, roda o parser existente (`fatorRParser`), obtém `cnpj` + `razão social` + Fator R.
  - Se a empresa não existir em `fator_r_companies`, cria automaticamente (nome + CNPJ) para dar suporte aos cards e ao histórico — sem exigir e-mails.
  - Grava `fator_r_monthly_results` (empresa, período, fator, status) e move o PDF para subpasta `Analisados`.
  - Desliga o envio automático de e-mails (mantém o código, mas com `dryRun=true` fixo enquanto não houver destinatário configurado).
- Cron: agendar via `pg_cron` para rodar dia 20 às 08:00 (`0 8 20 * *`) chamando `fator-r-drive-sync`.

## Dados / migração
- Não remover tabelas existentes (histórico continua útil).
- Marcar campos de e-mail/destinatários como opcionais na UI (backend já aceita nulo).
- Popular `fator_r_companies` automaticamente a partir dos PDFs.

## Fora de escopo
- Não alterar o parser de Fator R (mantém lógica atual de `not_applicable`, `attention`, `critical`, `safe`).
- Não mexer em Guias, Reforma Tributária ou outros módulos.
- Envio de e-mail de alerta fica desativado nesta fase (pode voltar depois com destinatário global).

## Perguntas antes de executar
1. Confirmo criar a pasta `PGDAS JULHO` no Drive `esc.zimmermann@gmail.com` e usar o ID dela como padrão? (posso criar via função de bootstrap)
2. OK desativar completamente o envio de e-mails de alerta nesta fase, ou você quer um único destinatário global (ex.: `ricardo@escritoriozimmermann.com.br`) recebendo tudo?
