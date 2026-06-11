## Plano de correção

1. **Tornar a detecção da DRE tolerante ao PDF real**
   - Ajustar o parser do Balanço+DRE para não depender apenas do título `DEMONSTRAÇÃO DO RESULTADO` em linha perfeita.
   - Usar marcadores decisivos da própria DRE como fallback: `RECEITA BRUTA OPERACIONAL`, `PRESTAÇÃO DE SERVIÇOS`, `CUSTO DOS SERVIÇOS PRESTADOS`, `LUCRO BRUTO`, `RESULTADO LÍQUIDO DO EXERCÍCIO`.
   - Normalizar variações comuns da camada de texto do PDF: acentos quebrados, caracteres especiais, espaços excessivos e quebras entre palavras.

2. **Corrigir o parser da Edge Function**
   - Aplicar a mesma lógica robusta no `process-tax-reform-document`, que é o fluxo usado no upload real.
   - Se o cabeçalho da DRE não for encontrado, localizar a seção pelo primeiro rótulo contábil decisivo, sem cair para erro falso.
   - Continuar bloqueando dados quando a leitura realmente falhar: `erro_leitura` não grava receita, custos, lucro ou percentuais.

3. **Sincronizar parser local e parser do backend**
   - Atualizar também o parser local usado nos testes para evitar divergência futura entre preview/testes e processamento real.
   - Manter PGDAS e folha intocados, exceto por imports/fixtures compartilhados se necessário.

4. **Adicionar testes contra a falha atual**
   - Criar casos simulando o texto do PDF sem o heading perfeito de DRE, mas contendo os rótulos reais.
   - Validar que o documento passa como lido e extrai:
     - Receita bruta: `902.870,81`
     - Simples Nacional: `74.867,75`
     - Receita líquida: `828.003,06`
     - Custos dos serviços: `386.206,28`
     - Lucro bruto: `441.796,78`
     - Lucro líquido: `375.304,85`
     - Custos/receita: aproximadamente `42,78%`
   - Validar negativamente que lucro líquido não vira receita e custos não viram `100%`.

5. **Reprocessar e validar o documento já anexado**
   - Depois da correção, reimplantar a Edge Function.
   - Reprocessar o documento `balanco e dre 2025 ez.pdf` já salvo no Cloud.
   - Conferir no banco que ele fica com `reading_status = lido`, `extraction_confidence >= 0.7` e valores corretos.

6. **Confirmar o painel Resultado**
   - Verificar que o painel passa a exibir os dados válidos da DRE/Balanço.
   - Confirmar que, se algum documento futuro falhar leitura, o Resultado continua sem usar dados inválidos no score.