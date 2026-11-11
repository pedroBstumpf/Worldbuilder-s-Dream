# ADR-0011 — Navegação principal como um livro (capa → biblioteca → mapa)

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
A identidade do Worldbuilder's Dream é um grimório de couro. O usuário quer que o login aconteça **na capa do livro** (um único botão "Entrar com Google", ver [ADR-0013](0013-login-google-e-acesso-fechado.md)), que o livro **se abra** para a escolha do mundo e que, ao escolher, uma **virada de página** leve ao mapa. Isso envolve três rotas (`/`, `/biblioteca`, `/w/:worldId`) com transições 3D, sem prejudicar acessibilidade, links diretos e desempenho.

## Decisão
- **`BookShellComponent`** é a rota de layout que contém `/` (capa) e `/biblioteca` (livro aberto). Detalhes em `docs/04` e `docs/05`. O livro é **um único objeto 3D persistente** (CSS `perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`) que muda de estado. A navegação entre capa e biblioteca troca o estado do livro, sem remontá-lo.
- As animações são orquestradas por um **`BookAnimator`** (serviço com Web Animations API/`motion`) com estados `closed → authenticating → unclasping → opening → open → turning → zooming`. Cada etapa devolve uma `Promise` e pode ser **pulada**.
- A passagem biblioteca → mapa usa **View Transitions API** (`withViewTransitions()` do Angular Router) com `view-transition-name: wd-world-map` compartilhado entre a ilustração da página e o canvas do mapa, criando o zoom contínuo. Em navegadores sem suporte, há fallback com fade de 200 ms.
- O carregamento dos dados do mundo começa **no clique**, em paralelo à animação.
- Rotas acessadas diretamente (link compartilhado, recarregar a página) **pulam** as animações.
- Preferência do usuário: completas / curtas / desligadas. `prefers-reduced-motion` força o fade cruzado.
- A virada de página pode usar uma biblioteca de *page flip* com licença permissiva (avaliar `page-flip`/StPageFlip, MIT) se a curvatura feita à mão não ficar convincente. Decidir na prova de conceito da Fase 0. **Decidido na F0-07: virada feita à mão, sem biblioteca** (ver [Resultado da prova de conceito](#resultado-da-prova-de-conceito-f0-07)).

## Consequências
- Experiência marcante e coerente com a marca; a animação também mascara a latência de carregamento.
- Mais complexidade: estado do livro, testes de transição e cuidado com foco e leitores de tela.
- Risco de desempenho em máquinas fracas: mitigado com versão curta automática quando o primeiro quadro da animação demorar demais (detecção de FPS baixo).

## Alternativas consideradas
- Telas convencionais com transição de fade: mais simples, mas perde a identidade pedida.
- Animação em vídeo/Lottie pré-renderizada: não se adapta ao formulário real na capa nem a tamanhos de tela; difícil de pular quadro a quadro.
- Livro em WebGL (Three.js): realismo maior, mas peso e complexidade desnecessários para o efeito desejado.

## Resultado da prova de conceito (F0-07)
*2026-11-11.* Página interna `/dev/livro` (só existe em desenvolvimento): capa → fecho → abertura → virada de página, em CSS 3D com a Web Animations API e sem dependências novas. A medição é feita pelo `pnpm perf:book`: Chromium do Playwright, mediana de 3 execuções por cenário, quadros amostrados com `requestAnimationFrame`, CPU normal e desacelerada pelo DevTools.

| CPU | Abertura da capa | Virada rígida | Virada curvada |
|-----|------------------|---------------|----------------|
| 1× | 60,8 fps · p95 16,8 ms | 60,3 fps · p95 16,7 ms | 60,3 fps · p95 16,8 ms |
| 4× | 60,8 fps · p95 16,7 ms | 60,6 fps · p95 16,7 ms | 60,5 fps · p95 16,8 ms |
| 6× | 60,8 fps · p95 16,8 ms | 60,8 fps · p95 16,7 ms | 60,7 fps · p95 16,8 ms |

Em todos os cenários: 0% de quadros longos (> 25 ms), pior quadro de 16,8 ms e primeiro quadro em até 13 ms. A renderização foi por software (SwiftShader, headless), pior que uma GPU de verdade.

**Leitura:** `transform` e `opacity` animados pela Web Animations API rodam no compositor; a thread principal não trabalha a cada quadro, por isso desacelerar a CPU 6× não muda nada. **Limite da medição:** o `requestAnimationFrame` enxerga a thread principal; quadros perdidos só no compositor (rasterização de camadas grandes) não aparecem e precisam ser conferidos no painel Performance do DevTools.

### Decisões
1. **Virada feita à mão, na variante curvada.** A folha é dividida em 8 faixas encadeadas (cada uma filha da anterior), que dobram até 7° em relação à vizinha: a borda lidera na subida e fica para trás na descida. Custa o mesmo que a rígida e convence bem mais. A rígida (um plano só) fica para a versão curta.
2. **StPageFlip (`page-flip`) descartada sem instalar.** A última versão é de 2022 (sem manutenção). Ela anima quadro a quadro em JS com `clip-path`, o que foge da regra "só `transform`/`opacity`" e sofre com CPU lenta. Também não tem como pular a animação nem devolver Promise.
3. **Sem a biblioteca `motion`.** A Web Animations API nativa basta: `finish()` pula, `finished` é a Promise da etapa e `commitStyles()` grava o estado final sem acumular `fill`.
4. **Profundidade das faces:** capa 3 px na frente e 1 px no verso; folha e faixas 2 px nos dois lados; página de baixo em 0. Depois de girar 180°, o verso fica por cima na ordem certa (a folha virada cobre o verso da capa), sem planos brigando.
5. **`will-change` só na propriedade animada.** `will-change: opacity` num elemento com `preserve-3d` achata o 3D: a frente aparece espelhada no lugar do verso. A regra foi registrada em `docs/05`.
6. **Acessibilidade:** as faixas são cópias decorativas (`aria-hidden`, `inert` e botões trocados por `span`); a folha real, interativa, só aparece fora da animação. Páginas escondidas ficam `inert`. O foco vai ao título da nova tela com `afterNextRender`, porque o `inert` só sai no ciclo de renderização seguinte.
7. **Detecção de fps baixo** (para F0-08): se o primeiro quadro passar de 50 ms ou mais de 20% dos quadros dos primeiros 300 ms forem longos, as próximas transições da sessão usam a versão curta.

### Pendências
- O zoom da biblioteca para o mapa (View Transition `wd-world-map`) não entrou na prova; fica para F0-08.
- Repetir `pnpm perf:book -- --headed` (GPU de verdade) e medir no DevTools num notebook fraco na revisão de desempenho (F4-03).
- `/dev/livro` serve de referência para o `BookShell` (F0-08) e pode ser apagada quando as transições definitivas existirem (F0-08).
