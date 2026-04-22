

# Republicar frontend + habilitar acesso ao módulo Consulta

## Causa raiz do 404

`https://ez-gestao.lovable.app/consulta/saude` retorna 404 porque o **build publicado está desatualizado**. As rotas `/consulta/*` existem no código (`src/App.tsx` linhas 60-64) e o `AppSidebar.tsx` já tem o grupo "Consulta Pública", mas o último deploy publicado em `ez-gestao.lovable.app` é anterior à adição dessas rotas.

Em Lovable, alterações de **frontend** (rotas, componentes, UI) só vão pra produção quando você clica em **Publish → Update**. Edge functions e migrations já foram pra produção automaticamente — o frontend, não.

## O que VOCÊ precisa fazer (ações manuais — 30 segundos)

### Passo 1 — Republicar o frontend
- **Desktop**: clicar no botão **Publish** (canto superior direito) → **Update**
- **Mobile**: tocar nos três pontinhos (`...`) no canto inferior direito → **Publish** → **Update**

Aguardar 20-40s o deploy concluir. Após isso, as 5 rotas vão funcionar:
- `/consulta`
- `/consulta/historico`
- `/consulta/excecoes`
- `/consulta/saude`
- `/consulta/relatorios/:id`

### Passo 2 — Habilitar o item no sidebar (opcional)
A flag `consulta_publica_enabled` está `false` no banco, então o grupo "Consulta Pública" não aparece no menu lateral. Isso é por design (gate do dry-run). Duas opções:

- **Opção A — Acessar via URL direta**: depois do Passo 1, basta digitar `https://ez-gestao.lovable.app/consulta` no navegador. Funciona mesmo com a flag desligada.
- **Opção B — Forçar a flag para teste imediato**: posso (em modo default) rodar uma migration que seta `consulta_publica_enabled = true`, fazendo o item aparecer no sidebar antes do dry-run. Recomendado só pra teste interno.

## O que EU vou fazer (após você aprovar este plano)

Mudo para o modo default e executo:

1. **Verificar o estado da flag** com uma `read_query` para confirmar o valor atual de `consulta_publica_enabled` em `feature_flags`.
2. **Se você escolher Opção B**: criar migration `UPDATE public.feature_flags SET enabled = true WHERE key = 'consulta_publica_enabled'` para liberar o item no sidebar.
3. **Verificação pós-publish (após você clicar em Update)**: usar o browser tool em `https://ez-gestao.lovable.app/consulta/saude` para confirmar que a rota carrega 200 e a página renderiza.
4. **Se ainda houver problema** após o republish (improvável): inspecionar console/network logs do deploy publicado para identificar erro de build runtime e corrigir.

## Não-regressão garantida

- Nenhum código de UI/rotas precisa ser alterado — está tudo correto no repositório.
- Migration da flag (se Opção B) toca **somente** uma linha de `feature_flags`, sem afetar nenhuma outra tabela.
- Nenhuma alteração em módulos atuais.

## Resposta direta às suas perguntas

| # | Item | Status |
|---|---|---|
| 1 | Rotas registradas em `App.tsx` | ✅ Sim, todas as 5 (linhas 60-64) |
| 2 | `App.tsx` atualizado no código | ✅ Sim (no preview/repo) — falta publicar |
| 3 | `AppSidebar.tsx` atualizado no código | ✅ Sim (linhas 135-149) — falta publicar |
| 4 | Flag bloqueia rota? | ❌ Não. Flag só esconde item do sidebar. Rota é acessível por URL |
| 5 | Erro de build/deploy? | ❌ Não há erro — simplesmente o deploy publicado é antigo |
| 6 | Republicar frontend | ⚠️ Ação manual sua (botão Publish) |
| 7 | Forçar rebuild | ⚠️ O botão Publish já faz rebuild + deploy completo |
| 8 | Caminho correto da rota | `https://ez-gestao.lovable.app/consulta/saude` (após republish) |

## Pergunta para você decidir

Qual opção prefere para o sidebar?
- **A** — Manter flag desligada (acessar via URL direta enquanto não roda dry-run)
- **B** — Eu ligo a flag agora via migration para o item aparecer no menu imediatamente

Independente da escolha, **clique em Publish → Update primeiro** — é o que destrava o 404.

