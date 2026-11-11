# CLAUDE.md

@AGENTS.md

## Como trabalhar neste repositório
- **Uma tarefa = uma branch = uma conversa.** As tarefas estão em `docs/12-git-e-branches.md` (Plano de branches). Ao terminar, sugira `/clear`.
- **Leia só os documentos da coluna "Ler" da tarefa.** Não leia a pasta `docs/` inteira.
- Tarefas que mexem em mais de ~3 arquivos: apresente um plano antes de editar.
- O front é construído primeiro em modo local (`docs/10`): componentes e stores só usam as portas de `domain/ports`.

## Git
- Crie a branch a partir do `main` atualizado:
  `git switch main && git pull --ff-only && git switch -c <tipo>/<id>-<descricao>` (nome exato da tabela da tarefa).
  Se a branch da tarefa anterior ainda não entrou no `main` (`git log main..<branch anterior>` não vazio), crie a nova a partir dela e avise que os merges devem seguir a ordem.
- Commits pequenos, um assunto cada; rode `pnpm lint && pnpm test` antes de cada commit.
- Mensagem: `tipo(escopo): descrição` em inglês, imperativo, minúsculas, até 72 caracteres; corpo em tópicos; rodapé `Refs: <ID>`.
- **Não escreva o número do commit**: o hook `prepare-commit-msg` adiciona (`0001`, `0002`, …).
- Migrações, tokens de design e dependências sempre em commits separados.
- **Nunca**: commitar no `main`, `git push`, merge, `--force`, `--no-verify`, commitar `.env`/segredos/dados reais.
- Ao concluir: liste os commits, diga o que testar manualmente e marque a tarefa com `[x]` no `docs/12` (em um último commit `docs(docs): mark <ID> as done`).

## Compact instructions
Ao compactar, preserve: ID da tarefa, branch atual, arquivos alterados, decisões tomadas e pendências.
