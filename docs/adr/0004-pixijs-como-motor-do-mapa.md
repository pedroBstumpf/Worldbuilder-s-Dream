# ADR-0004 — PixiJS v8 como motor do mapa

- **Status**: Aceito
- **Data**: 2026-11-09

## Contexto
O mapa precisa de pan/zoom fluido, centenas de tokens animados ao arrastar o slider, desenho vetorial, régua e imagens grandes. Opções: DOM/SVG, Canvas 2D (Konva/Fabric), WebGL (PixiJS), bibliotecas de mapa (Leaflet/OpenLayers com CRS plano).

## Decisão
Usar **PixiJS v8** com **pixi-viewport** para câmera, isolado atrás da fachada `MapEngine` sem dependência de Angular. Desenho suavizado com `perfect-freehand`.

## Consequências
- Renderização acelerada por GPU; escala para muitos tokens e efeitos (brilho, sombras, filtros).
- Isolamento permite trocar o motor ou rodá-lo em Worker (`OffscreenCanvas`) no futuro.
- Acessibilidade precisa ser fornecida à parte (lista espelhada).
- Mais código próprio para ferramentas (régua, pincel, seleção) do que em Konva/Fabric.

## Alternativas consideradas
- Konva — mais simples para editores, mas Canvas 2D limita desempenho com muitos sprites e texturas grandes.
- Leaflet/OpenLayers com `CRS.Simple` — ótimos para tiles e pan/zoom, mas fracos para tokens animados e ferramentas de edição livres.
- SVG/DOM — simples, porém degrada rápido com centenas de elementos animados.
