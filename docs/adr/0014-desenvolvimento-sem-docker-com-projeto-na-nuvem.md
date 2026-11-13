# ADR-0014 — Desenvolvimento sem Docker, com um projeto Supabase de desenvolvimento na nuvem

- **Status**: Aceito
- **Data**: 2026-11-13

## Contexto
O plano original (`docs/02`, `docs/03`) previa o Supabase local (`supabase start`) para desenvolver e testar o banco. Ele exige Docker, e no Windows o Docker Desktop exige WSL 2. A máquina de desenvolvimento não tem permissão de administrador, então não é possível instalar o WSL nem o Docker.

Fatos (verificados em 13/11/2026):
- O plano gratuito do Supabase permite **2 projetos ativos** por organização; projetos gratuitos pausam após 7 dias sem atividade e são retomados pelo painel, sem perda de dados.
- A Supabase CLI roda sem Docker para `init`, `migration new`, `link`, `db push` e `gen types --project-id`; `start`, `db reset` e `test db` precisam de Docker.
- Os runners `ubuntu-latest` do GitHub Actions já trazem Docker.

## Decisão
- **Desenvolvimento** usa um projeto Supabase na nuvem, **`wbdream-dev`** (organização *Worldbuilder's Dream*, plano gratuito, `sa-east-1`), sem dados reais. Produção continua no projeto **`wbdream`** (F2-07).
- As migrações em `supabase/migrations/` são a fonte da verdade. No `wbdream-dev` elas entram só por `pnpm db:push` (`supabase db push`). O servidor MCP do Supabase (`.mcp.json`) fica em **modo leitura** e serve apenas para consultar o projeto (extensões, região, advisors); nunca aplica migrações nem SQL de escrita.
- **pgTAP sem Docker**: `pnpm db:test` (script Node com `pg`) roda cada arquivo de `supabase/tests/` numa transação que é desfeita no fim, contra o banco de `DB_TEST_URL` (no `.env`, nunca commitado). Os testes criam e descartam os próprios dados; nada fica no `wbdream-dev`.
- **CI** continua usando o Supabase local (Docker do runner): banco limpo a cada execução, migrações aplicadas do zero e o mesmo `pnpm db:test`.
- O **teste de restauração** (`docs/09`) é feito no `wbdream-dev`, que pode ser zerado sem perda.

## Consequências
- Nada de Docker na máquina de desenvolvimento; o fluxo de banco depende de rede.
- O `wbdream-dev` é compartilhado: migrações aplicadas lá ficam aplicadas. Mudanças experimentais devem ser testadas primeiro dentro de uma transação (como os testes) ou desfeitas por nova migração.
- Os dois projetos gratuitos da organização ficam ocupados (dev e produção).
- O `wbdream-dev` pode pausar se ficar 7 dias sem uso; basta retomá-lo no painel.
- O CI valida as migrações num banco vazio, o que pega diferenças entre o histórico do `wbdream-dev` e os arquivos.

## Alternativas consideradas
- **Docker Desktop / WSL 2**: exige permissão de administrador.
- **Postgres instalado localmente sem Docker**: não tem os schemas `auth` e `storage` nem os papéis do Supabase; os testes de RLS não seriam fiéis.
- **Branches do Supabase**: exigem o plano Pro.
- **Testar só no CI**: ciclo de correção lento demais para escrever RLS e pgTAP.
