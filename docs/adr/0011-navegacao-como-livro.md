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
- A virada de página pode usar uma biblioteca de *page flip* com licença permissiva (avaliar `page-flip`/StPageFlip, MIT) se a curvatura feita à mão não ficar convincente. Decidir na prova de conceito da Fase 0.

## Consequências
- Experiência marcante e coerente com a marca; a animação também mascara a latência de carregamento.
- Mais complexidade: estado do livro, testes de transição e cuidado com foco e leitores de tela.
- Risco de desempenho em máquinas fracas: mitigado com versão curta automática quando o primeiro quadro da animação demorar demais (detecção de FPS baixo).

## Alternativas consideradas
- Telas convencionais com transição de fade: mais simples, mas perde a identidade pedida.
- Animação em vídeo/Lottie pré-renderizada: não se adapta ao formulário real na capa nem a tamanhos de tela; difícil de pular quadro a quadro.
- Livro em WebGL (Three.js): realismo maior, mas peso e complexidade desnecessários para o efeito desejado.
