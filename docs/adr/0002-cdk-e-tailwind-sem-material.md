# ADR-0002 — Angular CDK + Tailwind v4, sem Angular Material

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
A identidade visual (couro, filetes dourados, serifas, cantos pouco arredondados; [ADR-0012](0012-identidade-visual-couro-pergaminho-ouro.md)) é muito diferente do Material Design. Com o Angular Material, quase todo componente visível precisaria de overrides, e efeitos do M3 (ripple, formatos, animações) brigariam com a identidade. Além disso, o tema do Material usa Sass, que o Tailwind v4 não processa, o que obrigaria a manter dois sistemas de estilo. Os componentes mais característicos (linha do tempo, barras, área de importação, livro) são próprios de qualquer forma.

## Decisão
- Usar o **Angular CDK** para comportamento e acessibilidade: Overlay, Dialog, Menu, Listbox, Drag and Drop, A11y (foco, `ListKeyManager`, `LiveAnnouncer`), Scrolling, Clipboard e Layout.
- Usar **Tailwind CSS v4** para todo o visual, com os tokens de `docs/05`. Estilos só em CSS (sem Sass).
- Construir um pequeno conjunto de componentes próprios em `shared/ui/` (botão, tooltip, diálogo, menu, select, abas, campos, toast, popover), listado em `docs/04`.
- Ícones: Material Symbols (só a fonte de ícones, independente do Angular Material) e SVGs próprios.
- Acompanhar o **Angular Aria** (componentes acessíveis sem estilo do próprio Angular) e adotá-lo para abas, listbox, combobox e menu quando estiver estável.

## Consequências
- Visual 100% fiel às referências, sem brigar com um tema pronto.
- Um único sistema de estilos (Tailwind + variáveis CSS).
- Mais componentes para escrever e testar (cerca de 10 básicos). O CDK resolve a parte difícil (foco, teclado, posicionamento), mas a semântica ARIA de cada componente é responsabilidade nossa e é verificada com axe nos e2e.

## Alternativas consideradas
- Angular Material com overrides do M3: descartado pelo custo de customização e pelo Sass.
- Biblioteca de componentes de terceiros (PrimeNG, Spartan, Taiga): também exigiria customização pesada ou traria outro visual.
