# 10 — Roadmap

Estimativas para **uma pessoa desenvolvendo em tempo parcial**.

## Estratégia: front primeiro, com o back já desenhado
A ordem de construção é **front-end → back-end e banco → integrações → acabamento**. O objetivo é mostrar progresso visível ao cliente cedo, **sem jogar trabalho fora** depois. Isso só funciona porque o front é construído **já conhecendo** o back-end, o banco e as integrações descritos nos outros documentos.

### Prós e contras
| Prós | Contras (e como evitamos) |
|------|---------------------------|
| Progresso visível cedo: capa do livro, mapa, linha do tempo e tokens são o que impressiona e o que o cliente consegue avaliar | **"Demo que parece pronta"**: o cliente pode achar que falta pouco. → A demonstração mostra o selo "Modo demonstração: dados só neste navegador" e o roadmap deixa claro o que falta |
| As partes mais arriscadas e trabalhosas são do front (motor do mapa, tempo, animações); enfrentá-las primeiro reduz o risco do projeto | **UI desenhada para dados ideais** (sem latência, sem erro, sem conflito). → Os adaptadores locais podem simular atraso e falha, e os estados de carregamento/erro são feitos desde o início |
| Feedback de UX antes de fixar o schema do banco | **Retrabalho se o modelo de dados divergir**. → Os modelos do front seguem o `docs/07` desde o primeiro dia (ids `uuid`, ticks inteiros, `version`) |
| Sem custos nem contas de back-end no início | **Segurança e Google deixados para depois** podem esconder surpresas (login, tokens, Docs). → Ficam documentados e com provas de conceito marcadas na Fase 2 e 3; nada no front depende de detalhes que eles possam mudar |
| A demonstração não precisa de servidor nem de contas: o cliente acompanha por **vídeos de tela** do app rodando localmente | **Dados de teste presos no navegador** de quem desenvolve. → Exportar/importar mundo em JSON desde a Fase 1, no mesmo formato que o back-end vai importar |

**Conclusão:** é uma boa decisão para este projeto, desde que as regras abaixo sejam seguidas.

### Regras do "front primeiro"
1. **O front só conversa com as portas** (`domain/ports`). Na Fase 1 elas são implementadas por **adaptadores locais** (`data-access/local`, IndexedDB); na Fase 2, por adaptadores Supabase (`data-access/supabase`). Componentes e stores não mudam na troca.
2. **Modelos iguais ao banco** (`docs/07`): ids gerados no cliente com `crypto.randomUUID()`, ticks como inteiros, `version` nas entidades editáveis, `deleted_at` para a lixeira. Assim, os dados da demonstração podem ser importados no banco real sem conversão.
3. **Autenticação simulada só no modo local**: `FakeAuthService` faz a capa funcionar ("Entrar com Google" simulado) para mostrar as animações. O build de produção **não consegue** ligar o modo local (variável de build verificada no CI).
4. **Modo demonstração visível**: selo discreto na barra superior e aviso na biblioteca ("Os dados ficam só neste navegador. Exporte seus mundos.").
5. **Sem dados de exemplo no produto**: a demo também começa vazia (o cliente importa o próprio mapa). Fixtures existem só em testes e na página interna de desenvolvimento.
6. **Google Docs**: o conversor (`domain/gdocs`) e a renderização entram na Fase 3, junto com a vinculação real, testados com respostas da Docs API salvas em fixtures.
7. **Nenhum dado real antes do backup**: o app só passa a ser usado "para valer" depois da Fase 2, com backup diário funcionando.

## Fase 0 — Fundação do front (2–3 semanas)
- Repositório privado, pnpm, Angular 22 (zoneless), Angular CDK, Tailwind v4, ESLint/Prettier, lefthook, Vitest, Playwright.
- Design tokens couro/pergaminho/ouro, fontes e texturas; primeiros componentes de `shared/ui` (botão, ícone-botão, tooltip, diálogo, toast).
- `domain/`: modelos e portas (`WorldRepository`, `MapRepository`, `EntityRepository`, `EventRepository`, `AssetRepository`, `AuthService`), calendário e interpolação com testes.
- `data-access/local`: adaptadores IndexedDB; `FakeAuthService`; variável de build `dataSource: 'local' | 'supabase'`.
- CI (lint, testes, build, e2e) no GitHub Actions. Sem deploy da demonstração: as prévias são vídeos de tela.
- **Prova de conceito do livro** (capa → abertura → virada de página, medindo fps; decidido no ADR-0011: curvatura própria). A medição do mapa (PixiJS v8 + pixi-viewport com 500 tokens e imagem de 8192 px) entra no marco M1 da Fase 1, junto com o `MapEngine`. As transições do livro entram já no fim da Fase 0, com o `BookShell`.
- **Pronto quando**: o app rodando localmente abre na capa, o livro abre na biblioteca vazia, criar mundo vira a página até a área de importação; CI verde.

## Fase 1 — Front completo em modo local (8–10 semanas)
| Marco | Entregas |
|-------|----------|
| M1 · Mapas | Área de importação (arrastar e soltar, worker, WebP, redução automática), pan/zoom, escala, árvore de mapas, seletor no título |
| M2 · Entidades | CRUD, ficha com Tiptap, retratos, apelidos, Explorar com abas, busca (MiniSearch) |
| M3 · Tempo | Calendário configurável, linha do tempo com eras, play/velocidade, marcadores, CRUD de eventos |
| M4 · Tokens | Arrastar para o mapa, keyframes, interpolação, rastro, desfazer/refazer |
| M5 · Ferramentas | Marcar ponto, régua, pincel, região, rótulo (com validade temporal); camadas; versões da imagem do mapa no tempo |
| M6 · Livro | Capa, biblioteca, transições do livro, lixeira |
| M7 · Dados portáveis | Exportar e importar mundo em JSON (formato do `export-world`) |

**Marco de apresentação ao cliente**: as jornadas 1 e 2 do `docs/03` passam em modo local; RNF-01 a RNF-04 medidos.

### Medição dos RNF (F1-07, 2026-11-13, tag `v0.1.0-demo`)
As jornadas estão em `e2e/journeys.spec.ts`, com axe (WCAG 2.2 AA) em cada tela fora do canvas. As medições vêm de `pnpm perf:rnf` (`scripts/perf/rnf.mjs`): Chromium 158 do Playwright com janela visível (GPU Intel UHD Graphics 770), viewport de 1440 × 900, CPU normal (1×) e 4× mais lenta (hardware fraco).

| RNF | Meta | Medido (1×) | Medido (4×) | |
|-----|------|-------------|-------------|---|
| RNF-01 · canvas | 60 fps com 300 tokens visíveis | 60,0 fps no play e ao arrastar o slider, 0% de quadros > 33 ms | 56,7 fps (play), 57,4 fps (slider) | ✔ |
| RNF-02 · slider | posições recalculadas em < 8 ms por quadro | `setTime` p95 0,2 ms, pior 0,4 ms | p95 1,8 ms, pior 3,0 ms | ✔ |
| RNF-03 · carga | capa interativa < 2,5 s em banda larga; inicial < 300 kB gzip | capa interativa em 0,72 s (mediana de 5, pior 0,75 s); LCP 0,82 s; bundle inicial de produção 98,1 kB gzip | capa em 0,93 s | ✔ |
| RNF-04 · livro | ≥ 50 fps; nunca bloquear mais de 1,5 s | 58–61 fps nas quatro transições; com Esc, a tela chega em ≤ 0,8 s | 56–61 fps; com Esc, ≤ 0,9 s | ✔ |

- **Condições**: RNF-01 e RNF-02 rodam no servidor de desenvolvimento (build sem otimização, ou seja, pior caso), com 300 tokens andando entre duas posições, no play e arrastando o cursor da linha do tempo. RNF-03 usa um build otimizado em modo local (o de produção ainda não roda sem o Supabase) com rede de 20 Mbit/s e 40 ms e cache vazio; o tamanho do bundle vem do build de produção (`pnpm build && node scripts/ci/check-bundle.mjs`). RNF-04 usa o mesmo build otimizado.
- **Transições** (1×): abrir o livro 1,6 s; virar a página até o mapa 2,1 s (inclui criar o mundo e montar a tela); voltar ao livro 1,7 s; fechar 1,6 s. Pular com Esc é o que garante a meta de 1,5 s: a virada até o mapa leva até 0,9 s depois do Esc (o zoom até o mapa termina antes), as outras menos de 0,1 s. A maior tarefa longa foi de 101 ms, ao criar o mundo com a CPU 4× mais lenta.
- **Sem GPU** (headless, SwiftShader), o mapa fica em 33–41 fps a 1×, como já registrado no [ADR-0004](adr/0004-pixijs-como-motor-do-mapa.md); `setTime` continua abaixo de 1 ms.
- **Correção encontrada na medição**: o minificador do build otimizado reescreve `1200ms` como `1.2s`, e o livro lia os tokens `--wd-dur-*` como milissegundos sem olhar a unidade. Por isso, em produção, as transições virariam saltos de cerca de 1 ms. O `readBookTimings` agora entende `ms` e `s`.

## Fase 2 — Back-end e banco (4–6 semanas)
No Supabase, back-end e banco são a mesma peça (schema, RLS e funções), por isso entram juntos.
- Projeto Supabase; migrações do `docs/07` com RLS e pgTAP; lista de acesso **só com o e-mail do administrador**; hook *before user created*.
- Login real com Google (Supabase Auth); `AuthService` real.
- Storage + `process-asset`; adaptadores `data-access/supabase` implementando as mesmas portas.
- Importar os mundos exportados da demonstração.
- **Backup diário funcionando** (`docs/09`, `docs/11` seção 9) e um teste de restauração.
- CSP e headers de segurança aplicados; deploy no domínio próprio.
- **Pronto quando**: o administrador usa o app com dados reais, protegidos por RLS e com backup.

## Fase 3 — Integrações Google e convites (4–6 semanas)
- `google-connect`, `google-token`, `google-disconnect`; Picker.
- **Google Docs como texto**: conversor Doc → Tiptap com fixtures, vincular, renderizar, nomes e datas, "Editar no Google Docs" com recarga por revisão, aba História, criar Doc a partir da ficha.
- Imagens no Drive (opção).
- **Convites por e-mail** (Resend + domínio, Configurações › Pessoas, capa em modo convite, revogação) e membros por mundo.
- **Pronto quando**: a jornada 3 do `docs/03` passa; teste manual com conta Google real.

## Fase 4 — Acabamento e lançamento (2–3 semanas)
Arte final da capa, os 5 componentes animados do MVP (Skiper UI/Magic UI), polimento das animações, revisão de acessibilidade e desempenho, exclusão de conta, checklist de release do `docs/09`.

## Fase 5 — Evolução
- Tempo real entre os usuários de um mundo e presença.
- Cache offline de leitura (o adaptador local da Fase 1 é reaproveitado como cache).
- Edição leve de Google Docs dentro do app (`documents.batchUpdate`).
- Mapas gigantes com tiles, rotas que seguem caminhos, árvore genealógica e grafo de relações, fios narrativos, exportação PDF/EPUB, edição no celular.

## Riscos
| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Cliente achar que a demo está quase pronta | Médio | Selo de modo demonstração; apresentar este roadmap junto |
| Animações do livro levarem mais tempo que o previsto | Médio | Prova de conceito na Fase 0; versão curta automática com fps baixo; puláveis |
| Desempenho do canvas com imagens grandes | Alto | Limite de 8192 px, culling, atlas; prova de conceito na Fase 0 |
| Modelo local divergir do banco | Médio | Modelos seguem o `docs/07`; teste que importa um JSON exportado no `wbdream-dev` na Fase 2 |
| Conversor de Docs não cobrir os recursos usados nos textos reais | Médio | Fixtures com Docs reais do cliente; aviso "abra no Google Docs" para o que não for suportado |
| Job de backup parar sem ninguém notar | Alto | E-mail de falha do GitHub; rotina mensal do `docs/11`; teste trimestral de restauração |
| Mudanças nas APIs do Google ou no plano gratuito do Supabase | Médio | Portas de repositório; Pro disponível sem migração |
| Arte da capa sem direitos claros | Médio | Arte própria em camadas, licença registrada em `THIRD_PARTY_NOTICES.md` |
