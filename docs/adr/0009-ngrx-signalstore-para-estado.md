# ADR-0009 — NgRx SignalStore para estado

- **Status**: Aceito
- **Data**: 2026-11-09

## Contexto
O editor tem estado rico (cena do mapa, seleção, ferramenta, tempo, histórico) compartilhado entre barras, canvas e diálogos. Serviços com signals soltos tendem a virar código difícil de testar; NgRx Store clássico tem muito *boilerplate*.

## Decisão
Usar **@ngrx/signals (SignalStore)** com stores por escopo de rota (`docs/04`), métodos assíncronos com atualização otimista e um `HistoryStore` baseado em Command para desfazer/refazer.

## Consequências
- Estado tipado, composável (`withState`, `withComputed`, `withMethods`, *features* reutilizáveis) e nativo de signals.
- Destruição automática ao sair do mundo.
- Dependência externa adicional, porém amplamente usada e mantida.

## Alternativas consideradas
- Serviços com signals simples — aceitável para estado pequeno; usado em `core/`.
- NgRx Store (Redux) — descartado: verboso para este caso.
- Akita/Elf — descartados: comunidade menor.
