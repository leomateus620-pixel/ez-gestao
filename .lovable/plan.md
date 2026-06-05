## Trocar a logo do projeto pela logo real

A logo anexada (letra "Z" laranja com detalhe cromado) vai substituir os badges quadrados com o texto "EZ" que existem hoje no app, além do favicon.

### O que muda visualmente
- **Tela de Login** (`src/pages/Login.tsx`) — quadrado gradiente com "EZ" → logo real.
- **Sidebar nova** (`src/navigation/components/SmartSidebar.tsx`) — badge "EZ" no topo → logo real.
- **Sidebar legada** (`src/components/AppSidebar.tsx`) — badge "EZ" → logo real (mantém o texto "EZ Gestão" ao lado).
- **Favicon / aba do navegador** (`index.html`) — `favicon.ico` padrão → logo real.

### Como será feito (técnico)
1. Subir `favicon_logo_1024_transparente.png` como asset de CDN via `lovable-assets` → gera `src/assets/ez-logo.png.asset.json`.
2. Criar um pequeno componente `src/components/BrandLogo.tsx` que renderiza `<img>` com a logo + `alt="EZ Gestão"`, aceitando `className` para tamanho (usado em 32px no sidebar/topbar e 48px no login).
3. Trocar os três badges "EZ" pelo `<BrandLogo />` mantendo o mesmo tamanho do quadrado atual (sem alterar layout, espaçamento ou tipografia ao redor).
4. Copiar a logo também para `public/favicon.png`, remover `public/favicon.ico` (se existir) e atualizar `<link rel="icon">` no `index.html`.

### Fora do escopo
- Não muda paleta, tipografia, layout, nem o texto "EZ Gestão".
- Não mexe em lógica de autenticação, dados ou rotas.
