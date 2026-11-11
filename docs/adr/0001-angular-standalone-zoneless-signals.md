# ADR-0001 — Angular standalone, zoneless e signals

- **Status**: Aceito
- **Data**: 2026-11-09

## Contexto
O usuário escolheu Angular. Precisamos definir o estilo de Angular: módulos ou standalone, Zone.js ou zoneless, RxJS ou signals. O Angular 22 é a versão ativa (lançada em junho de 2026), com zoneless como padrão desde a v21 e majors agora anuais.

## Decisão
Usar **Angular 22** com componentes **standalone**, detecção de mudança **zoneless**, **signals** como primitiva de estado (`input()`, `output()`, `model()`, `computed()`, `resource()`), controle de fluxo nativo (`@if`, `@for`, `@defer`) e builder `@angular/build` (esbuild/Vite). RxJS apenas para streams genuínos (Realtime, debounce).

## Consequências
- Melhor desempenho e previsibilidade para um app com canvas pesado: o ticker do Pixi não dispara detecção de mudança.
- Código alinhado com a direção oficial do framework; menos *boilerplate*.
- Bibliotecas que dependem de Zone.js precisam ser evitadas ou adaptadas.
- Equipe precisa dominar signals e `effect()` com cuidado (evitar efeitos que escrevem em signals).

## Alternativas consideradas
- React/Next.js — descartado: preferência do usuário e ecossistema maduro do Angular (CDK, tooling).
- Angular com Zone.js — descartado: custo de desempenho e caminho legado.
