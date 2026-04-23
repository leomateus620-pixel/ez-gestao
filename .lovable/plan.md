

# Atualizar label do dry-run na UI

## O que será feito

Atualizar o título visível do card de dry-run em `/consulta/saude` que ainda mostra o CNPJ antigo "88.736.335/0001-13", trocando para o novo CNPJ de teste **47.737.345/0001-96** (CAMILA DA SILVA WEINERT SERVICOS ADMINISTRATIVOS LTDA).

## Arquivo alterado

**`src/pages/consulta/ConsultaSaude.tsx`** (linha 220)

De:
```tsx
<CardTitle className="text-base flex items-center gap-2">
  <Play className="h-4 w-4" /> Dry-run Zimmermann (88.736.335/0001-13)
</CardTitle>
```

Para:
```tsx
<CardTitle className="text-base flex items-center gap-2">
  <Play className="h-4 w-4" /> Dry-run Weinert (47.737.345/0001-96)
</CardTitle>
```

Também ajusto a descrição abaixo (se mencionar "Zimmermann") para "Weinert" para manter consistência visual. O ID interno do dry-run (`dry_run_zimmermann` em `automation_config_kv`) **continua igual** — é só uma chave de banco, não vale a pena migrar e criar risco.

## Sem mudanças em
- Edge functions (`dry-run-zimmermann*`) — CNPJ já foi atualizado para `47737345000196` na rodada anterior.
- Chave `dry_run_zimmermann` no `automation_config_kv` — mantida para preservar histórico.
- Lógica de dispatch, cache, retry, captcha, PDF download.

## Resultado esperado

O card no topo de `/consulta/saude` passa a mostrar **"Dry-run Weinert (47.737.345/0001-96)"**, refletindo o CNPJ que de fato é executado.

