# AGENTS.md — Regras para quem (ou o que) escreve código neste repositório

Resumo das regras para pessoas e assistentes de IA. Os detalhes estão em `docs/`.

## Antes de mudar qualquer coisa
1. Leia o documento da área afetada: `docs/02` arquitetura e back-end, `docs/04` front-end, `docs/05` design, `docs/06` mapa e tempo, `docs/07` dados, `docs/08` Google, `docs/09` segurança e operação.
2. Se a mudança contradiz um documento ou ADR, **pare** e proponha a alteração no ADR correspondente (`docs/adr/`).

## Regras inegociáveis
- **Toda tabela tem RLS habilitado** e políticas testadas com pgTAP. Nunca use a `service_role` key no front-end.
- **Acesso fechado**: login só com Google; e-mails autorizados ficam em `private.allowed_emails` — o administrador entra por migração, os demais só por convite aceito (`accept-invite`). Convidar e revogar são exclusivos do administrador e verificados nas Edge Functions.
- **Toda mudança de schema é uma migração** em `supabase/migrations/`; depois, `pnpm gen:types` e commit de `database.types.ts`.
- **Sem dados de exemplo**: não há `seed.sql` nem mundos de demonstração; testes criam e descartam os próprios dados.
- **Componentes Angular são standalone, `OnPush`, com signals**; sem `NgModule`; sem Zone.js.
- **Sem Angular Material**: comportamento com Angular CDK, visual com Tailwind e os componentes de `shared/ui`.
- **O motor do mapa (PixiJS) não conhece Angular**: só a fachada `MapEngine` (`docs/06`).
- **Só `data-access/` chama o Supabase**, implementando as portas de `domain/ports`. O front é construído primeiro com `data-access/local` (IndexedDB); componentes e stores **nunca** sabem qual adaptador está ativo (`docs/10`).
- **Modelos do front = modelo do banco** (`docs/07`): ids `uuid` gerados no cliente, ticks inteiros, `version`, `deleted_at`.
- **Modo local nunca vai para produção**: o build de produção falha com `dataSource: 'local'`.
- **Nada de `innerHTML`**: textos são JSON do Tiptap; Google Docs são convertidos de JSON, nunca injetados como HTML.
- **Tokens do Google**: refresh token só no Vault (via Edge Functions); access token só em memória; nunca em logs.
- **Segredos** só em Supabase Secrets e GitHub Secrets; nunca em `environment.ts`, commits ou logs.
- **Cores e fontes só por tokens** (`--wd-*`, `couro-*`, `pergaminho-*`, `ouro-*`); ouro só para destaque.
- **Animações**: só `transform`/`opacity`; respeitam `prefers-reduced-motion` e a preferência "Animações do livro"; transições do livro são puláveis.
- **Código portado da Skiper UI/Magic UI**: cabeçalho com origem e licença e entrada em `THIRD_PARTY_NOTICES.md`; só componentes gratuitos.
- **Acessibilidade**: todo controle tem nome acessível e é operável por teclado.
- **Não quebrar o backup**: mudanças em schema, buckets ou segredos devem manter o `backup.yml` funcionando (`docs/09`).

## Git
Uma tarefa = uma branch (`<tipo>/<id>-<descricao>`), criada do `main` atualizado. Commits pequenos no formato `NNNN tipo(escopo): descrição` (o número é adicionado pelo hook). Nunca commitar no `main`, fazer push ou merge sem pedido. Detalhes e plano de tarefas: `docs/12`.

## Comandos
```bash
pnpm start          # dev server
pnpm test           # Vitest
pnpm e2e            # Playwright (+ axe)
pnpm lint           # ESLint + Prettier
pnpm db:test        # pgTAP
pnpm gen:types      # tipos do banco
```

## Definição de pronto
Lint, testes e budgets verdes · RLS testado em tabela nova · sem regressão de acessibilidade · verificado localmente · documentação atualizada se o comportamento mudou.
