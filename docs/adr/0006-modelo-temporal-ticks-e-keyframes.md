# ADR-0006 — Tempo como ticks inteiros, calendário configurável e keyframes

- **Status**: Aceito
- **Data**: 2026-11-09

## Contexto
Mundos fictícios têm calendários próprios (meses, eras, anos negativos). Tokens precisam de posição em função do tempo. Datas reais (`timestamptz`) não servem.

## Decisão
Tempo do mundo é um **`bigint` de minutos** desde a época zero; a conversão para datas legíveis é feita por um **calendário JSON por mundo**. Posições de tokens são **keyframes** `(token, tick, x, y, visible, interpolation)` e o estado em qualquer instante é obtido por **busca binária + interpolação** no cliente.

## Consequências
- Ordenação, intervalos e índices triviais no banco; aritmética simples.
- Suporta qualquer calendário inventado e mudanças de calendário sem migrar dados.
- Arrastar o slider é barato (nenhuma consulta ao servidor).
- Precisão mínima de 1 minuto (suficiente para narrativa).
- Ao mudar o calendário (ex.: duração do ano), datas exibidas mudam, mas a ordem dos eventos é preservada; a UI avisa.

## Alternativas consideradas
- `timestamptz` com calendário gregoriano — descartado: não representa calendários fictícios.
- Armazenar posições por "capítulo" em vez de tempo — descartado como base; pode existir como camada narrativa por cima (Fase 5).
