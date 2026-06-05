## Remover o fundo laranja atrás da logo

A logo (Z laranja) está dentro de um container com gradiente/borda laranja no `SmartSidebar` — é isso que cria o "quadrado laranja" ao redor. Vou tirar esse container para a logo flutuar direto sobre o sidebar.

### Mudança
- **`src/navigation/components/SmartSidebar.tsx`** — remover o wrapper externo `bg-gradient-to-br from-brand-orange-deep via-primary to-brand-orange-light p-[1px]` e o inner `bg-white/78`. A logo passa a ser renderizada direto (`<BrandLogo />`) dentro de um container 40×40 transparente.

### Fora do escopo
- Login e AppSidebar legado já usam fundo branco translúcido — não precisam mudar. Se quiser que eu remova o branco deles também, é só pedir.
- Não muda a cor da própria logo (Z continua laranja).
