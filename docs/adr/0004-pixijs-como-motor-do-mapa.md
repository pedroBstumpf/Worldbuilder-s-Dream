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

## Medição (F1-01, 2026-11-11)
Cena com imagem de **8192 × 8192 px** e **500 tokens** (disco com anel, culling ligado), medida com `pnpm perf:map` (Playwright, viewport 1440 × 900, 4 s por cenário; pan = arrastar contínuo; zoom = roda indo e voltando). A CPU desacelerada simula uma máquina fraca.

| Renderizador | CPU | Parado | Pan | Zoom | Quadros > 33 ms |
|--------------|-----|--------|-----|------|-----------------|
| Intel UHD Graphics 770 (D3D11, janela visível) | 1× | 60,1 fps | 60,1 fps | 60,1 fps | 0% |
| Intel UHD Graphics 770 (D3D11, janela visível) | 4× | 60,1 fps | 60,1 fps | 60,1 fps | 0% |
| SwiftShader (software, headless) | 1× | 47,2 fps | 48,6 fps | 42,6 fps | 10–15% |
| SwiftShader (software, headless) | 4× | 33,2 fps | 31,2 fps | 31,1 fps | 29–37% |

- Com GPU (mesmo integrada), a meta de 60 fps se mantém, inclusive com a CPU 4× mais lenta: o custo está na GPU, não no JavaScript.
- Sem GPU (renderização por software), a tela continua utilizável (> 30 fps), mas abaixo da meta. É o caso de máquinas virtuais e navegadores com aceleração desligada; não exige mudança agora.
- Importar a imagem de 8192 px (decodificar no Worker, WebP 0,9, miniatura, primeira cena): ~3,5 s.
- Decisão mantida. Reavaliar com retratos (atlas) no M4 e com as anotações vetoriais no M5, repetindo `pnpm perf:map`.
