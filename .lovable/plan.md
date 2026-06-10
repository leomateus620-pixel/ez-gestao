## Diagnóstico — onde os parsers atuais quebram em documentos grandes

**Folha de pagamento** (`process-tax-reform-document/index.ts`, `extractors.ts`)
- Pega o **primeiro** `Total:` que aparece. Folhas com totais parciais por departamento/estabelecimento antes do total geral retornariam números errados.
- Janela de lookahead apenas `+6 linhas` para reconstruir a linha Total — insuficiente quando unpdf quebra a linha em mais pedaços.
- Lista de linhas a ignorar é estreita (`Total de empregados|Página|JB Folha|Pacote`). Cabeçalhos repetidos em páginas seguintes (`Empregado`, `Empresa:`, `Inscr. Fed.`) podem ser concatenados como números.
- Não valida coerência interna (`Líquido = Prov./Vant. − Descontos`) → aceita silenciosamente leitura corrompida.

**PGDAS** (`extractors.ts` `firstNumberNear`)
- Lookahead fixo de 4 linhas. Em PGDAS retransmitido ou com múltiplos anexos pega a primeira ocorrência (pode ser anexo errado).
- Não valida `dasTotal ≈ Σ(irpj…iss)`.

**DRE / Balancete** (`numberAfter` na edge function)
- `{0,80}` caracteres entre rótulo e valor. Balancetes com colunas largas (saldo anterior, débito, crédito, saldo atual) ultrapassam isso → pega valor errado ou nenhum.
- Não privilegia o último número da linha (que costuma ser o saldo atual).

**Geral**
- Sem cap de páginas/tamanho de texto. PDF de 200+ páginas pode estourar o timeout de 60s da edge function.
- Quando faltam campos decisivos, alguns ramos ainda marcam `reading_status='lido'` com confiança baixa em vez de `erro_leitura`. Risco de dado incorreto entrando no score.

---

## Plano de correção (foco: robustez sem alterar UI)

**Arquivos:** `supabase/functions/process-tax-reform-document/index.ts`, `src/features/tax-reform/document-analysis/extractors.ts`, `src/features/tax-reform/document-analysis/normalize.ts`, novo `__tests__/parsers-large.test.ts`.

### 1. Folha de pagamento — escalável e à prova de ruído

- **Pegar o ÚLTIMO `Total:` válido** (não o primeiro). Itera de trás para frente e seleciona o primeiro `Total:` que produz 11 números coerentes.
- **Expandir lookahead** para até 30 linhas, mas **parar imediatamente** ao encontrar uma "barreira": linha com `Empregado`, `Empresa:`, `Inscr. Fed.`, `RESUMO`, outro CNPJ, novo `Total:`, ou cabeçalho de página (`Página`, `JB Folha`, `Pacote`).
- **Validação de coerência** dos 11 números:
  - `|Líquido − (Prov./Vant. − Descontos)| ≤ 1,00`
  - `salaryTotal ≤ grossPayroll`
  - Falhou → `confidence = 0.3`, warning explícito, **não** grava como `lido`.
- **Suporte multi-estabelecimento**: se mais de um bloco `Total:` válido é encontrado, soma os 11 vetores e expõe `establishmentsAggregated = N` no `extracted_values`.
- **`employeesCount`**: aceita o número na linha seguinte a `Total de empregados:` (multi-linha do unpdf).

### 2. PGDAS — múltiplos anexos / retransmissões

- `firstNumberNear`: lookahead 4 → **10 linhas**, com mesma lógica de barreira (parar em outro rótulo conhecido).
- Para `dasTotal`, `monthlyRevenue`, `RBT12`: se houver múltiplas ocorrências, **prioriza a última** (transmissão mais recente).
- **Validação cruzada**: `dasTotal ≈ Σ(irpj+csll+cofins+pis+inssCpp+icms+ipi+iss)` com tolerância R$ 1; divergência → warning e reduz confiança em 0.2.

### 3. DRE / Balancete — colunas largas

- Substituir `numberAfter` por busca por linha: localiza linha do rótulo e devolve o **último** número monetário da própria linha (saldo atual em balancetes). Cai para a próxima linha apenas se a atual não tiver número.
- Janela expandida (até a próxima linha não-vazia), sem limite de 80 chars.
- Espelhar no edge function o cálculo `annualPayrollFromDre` somando apenas contas explícitas (já existe em src), evitando dupla contagem.

### 4. Garantias gerais

- **Cap de páginas no `parsePdf`**: limita extração a 200 páginas; se exceder, processa as 200 primeiras e adiciona warning `Documento truncado em 200 páginas para análise`.
- **Cap de texto**: se `text.length > 5_000_000`, truncar com warning.
- **Timeout protetor**: `Promise.race` de 50s envolvendo o `extract()`; estouro → `reading_status = 'nao_processavel'` com motivo claro.
- **Política unificada de "campos decisivos" por tipo** (gate antes de gravar `lido`):
  - PGDAS: precisa `monthlyRevenue` E `grossRevenue12m` E (`dasTotal` OU `effectiveTaxRate`).
  - DRE: precisa `grossRevenue` E pelo menos uma de (`costs`, `grossProfit`, `netProfit`).
  - Folha: precisa `salaryTotal` E `netPayroll` E `period`.
  - Faltou → `reading_status = 'erro_leitura'` com lista explícita do que faltou (mensagem por extenso na UI), `extracted_findings = []`, confidence 0. Nunca alimenta o score.

### 5. Testes

Novo arquivo `parsers-large.test.ts` com fixtures sintéticas (geradas em código, não PDFs reais) cobrindo:
- Folha com 50 empregados e 3 estabelecimentos (totais parciais + total geral) → confere agregação.
- Folha com `Total:` parcial seguido de cabeçalho de página → não pega valores do cabeçalho.
- Folha com `Líquido` inconsistente → não marca como `lido`.
- PGDAS retransmitido (dois blocos `Receita Bruta do PA`) → usa o último.
- DRE em formato balancete (4 colunas) → pega o saldo atual (última coluna).
- Documento sem campos decisivos → retorna `erro_leitura` com mensagem específica.

Manter os 13 testes existentes verdes.

## Fora de escopo

- OCR para PDFs escaneados.
- Mudanças visuais no painel Resultado.
- Refatoração para mover toda a lógica do edge para `src/` (parsers continuam duplicados, apenas alinhados).
