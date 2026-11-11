# 06 — Mapa e tempo

O coração do produto. Esta seção define como o mapa é renderizado, como o tempo é modelado e como tokens se movem.

## 0. Importar o mapa (arrastar e soltar)
Um mundo sem mapa mostra **apenas** a área de importação (visual em [`docs/05`](05-design.md#área-de-importação-de-mapa-mundo-sem-mapa)).

Fluxo técnico:
1. `MapImportDirective` escuta `dragenter`/`dragover`/`drop` **na janela inteira** (com `preventDefault`), além do `<input type="file" accept="image/png,image/jpeg,image/webp">` do botão e de `paste` com imagem.
2. Validação no cliente: tipo MIME **e** assinatura do arquivo (primeiros bytes), tamanho bruto ≤ 50 MB.
3. Decodificação com `createImageBitmap` (num Web Worker com `OffscreenCanvas`, para não travar a tela).
4. Se o lado maior passar de **8192 px**, a imagem é **reduzida automaticamente** a 8192 px (com aviso "reduzimos para caber na GPU"), em vez de ser recusada.
5. Conversão para **WebP** (qualidade 0,9; remove metadados EXIF) e geração de miniatura de 512 px para a biblioteca.
6. A cena carrega **imediatamente** a partir do bitmap local. O registro do mapa (`maps`, com `width`/`height` reais) é criado de forma otimista, e o envio do arquivo segue em segundo plano (Storage do Supabase por padrão; pasta do mundo no Google Drive se o usuário preferir, ver [ADR-0007](adr/0007-armazenamento-de-imagens.md)), com nova tentativa se falhar e sem perder a imagem local (fica em IndexedDB até o envio concluir).
7. Escala (`scale_value`/`scale_unit`) fica nula até o usuário definir; enquanto isso, a régua mede em pixels do mapa.

## 1. Motor de renderização
- **PixiJS v8** (WebGL/WebGPU) + **pixi-viewport** para câmera (arrastar, zoom com roda/pinça, desaceleração, limites).
- Motivo: centenas de tokens animados a 60 fps, texturas grandes, filtros e culling. Ver [ADR-0004](adr/0004-pixijs-como-motor-do-mapa.md).
- O motor roda **fora do ciclo de mudança do Angular** (app é zoneless; o ticker do Pixi não aciona renderização de templates).

### Fachada pública (`map-engine/map-engine.ts`)
O resto do app só conhece esta interface:
```ts
export interface MapEngine {
  mount(host: HTMLElement): Promise<void>;
  destroy(): void;

  loadScene(scene: MapScene): Promise<void>;          // imagem, escala, tokens, keyframes, anotações
  applyPatch(patch: ScenePatch): void;                 // mudanças incrementais vindas da store

  setTime(tick: number): void;                         // chamado pelo TimelineService
  setTool(tool: ToolId, options?: ToolOptions): void;
  setSelection(ids: string[]): void;

  screenToWorld(clientX: number, clientY: number): Point;
  worldToScreen(p: Point): Point;
  focus(target: { tokenId?: string; point?: Point; zoom?: number }, animate?: boolean): void;
  fitToMap(): void;

  readonly events: EngineEventBus;                     // eventos tipados (abaixo)
}

type EngineEvent =
  | { type: 'token:moved'; tokenId: string; to: Point; tick: number }
  | { type: 'token:selected'; ids: string[] }
  | { type: 'token:open'; tokenId: string }            // duplo clique
  | { type: 'annotation:created'; draft: AnnotationDraft }
  | { type: 'annotation:changed'; id: string; patch: Partial<AnnotationDraft> }
  | { type: 'measure'; points: Point[]; distance: number }
  | { type: 'camera'; center: Point; zoom: number };
```
O componente `wd-map-canvas` é um adaptador fino: cria o motor, liga `effect(() => engine.setTime(timeline.currentTick()))`, traduz `events` em chamadas às stores.

### Camadas (ordem de desenho)
1. **Background** — imagem do mapa (ou tiles na Fase 5), cor de fundo.
2. **Regiões/anotações de fundo** — territórios, fronteiras (pincel), áreas.
3. **Rotas/rastros** — caminhos interpolados de tokens selecionados.
4. **Tokens** — entidades e eventos.
5. **Pinos e rótulos** — sempre legíveis (escala inversa ao zoom).
6. **Overlay de ferramenta** — régua, seleção retangular, prévia do pincel, alvo de drop.

### Sistema de coordenadas
- **Coordenadas do mundo = pixels da imagem original do mapa** (0,0 no canto superior esquerdo). Independe do tamanho de tela e do zoom.
- Cada mapa tem `scale_value` + `scale_unit` (ex.: `1 px = 0.5 km`), configurado pelo usuário desenhando uma linha sobre a escala gráfica do mapa e informando o comprimento.
- Se a imagem for substituída por outra de resolução diferente, guardamos `width/height` originais e reescalonamos coordenadas proporcionalmente.

### Desempenho
- **Culling** de tokens fora da viewport; rótulos só acima de um limiar de zoom.
- Texturas de retrato em **atlas** (spritesheet gerada em runtime) e tamanho fixo (96 px), com mipmaps.
- Imagem de mapa: limite inicial de **8192 × 8192 px** (limite seguro de textura WebGL); acima disso, dividir em blocos no cliente ou exigir tiles (Fase 5).
- Reaproveitar objetos (pool) em vez de recriar sprites a cada patch.
- `resolution: devicePixelRatio` com teto 2.

## 2. Modelo de tempo
Ver [ADR-0006](adr/0006-modelo-temporal-ticks-e-keyframes.md).

### Tick
- Tempo do mundo é um **inteiro (`bigint`) de minutos** desde a época zero do mundo. Negativo = antes da época.
- `bigint` em minutos cobre ± 17 trilhões de anos — suficiente para qualquer cosmologia.
- No front, `number` é seguro até 2⁵³ (≈ 17 bilhões de anos em minutos); validar limites na entrada.

### Calendário
Cada mundo tem um calendário (JSON validado por schema) que converte ticks ⇄ datas:
```json
{
  "minutesPerHour": 60,
  "hoursPerDay": 24,
  "weekdays": ["Solar", "Lunar", "Marte", "Mercúrio", "Júpiter", "Vênus", "Saturno"],
  "months": [
    { "name": "Geada", "days": 30 },
    { "name": "Degelo", "days": 30 },
    { "name": "Semeadura", "days": 31 }
  ],
  "leap": { "everyYears": 4, "monthIndex": 1, "extraDays": 1 },
  "eras": [
    { "name": "Era Antiga", "abbr": "EA", "startYear": -5000, "direction": "backward" },
    { "name": "Era da Coroa", "abbr": "EC", "startYear": 0 }
  ],
  "epochLabel": "Fundação de Valmora",
  "format": "{day} de {month} de {year} {era}"
}
```
- `domain/calendar` implementa `toDate(tick)`, `fromDate(parts)`, `format(tick, precision)`, `startOf(unit, tick)` e `add(unit, n, tick)`. É TS puro e tem cobertura de testes alta (incluindo anos bissextos e eras negativas).
  - Uso: `new Calendar(parseCalendarDefinition(json))`; o schema (zod) é `calendarDefinitionSchema`.
  - **Ano astronômico** nas contas: o ano 0 é o da época (contém o tick 0); negativos vêm antes.
  - **Bissexto** quando `ano mod everyYears = 0`, também para anos negativos; o dia extra entra no mês `leap.monthIndex`.
  - **Eras sem ano zero**: as eras ficam em ordem crescente de `startYear` e a primeira também cobre os anos anteriores. Numa era `forward` (padrão), `startYear` é exibido como 1. Numa era `backward`, a contagem desce até o início da era seguinte (o ano anterior a ela é 1), como "a.C.". Por isso uma era `backward` nunca é a última.
  - **Modelos de texto**: `format` vale para a precisão de dia; `formats` sobrescreve as outras (padrões em português: `{year} {era}`, `{month} de {year} {era}`…). Tokens: `{day}`, `{month}`, `{monthNumber}`, `{year}`, `{era}`, `{eraName}`, `{weekday}`, `{hour}`, `{minute}`.
  - `add` em meses e anos mantém o dia e, se ele não existir no destino, usa o último dia do mês (31 de janeiro + 1 mês = 28 ou 29 de fevereiro).
- Um calendário "Gregoriano simplificado" (`DEFAULT_CALENDAR`) é o padrão ao criar o mundo: meses gregorianos, bissexto a cada 4 anos (o ano da época, 1 EC, é bissexto), eras AEC/EC, e a época cai num domingo.
- Precisão de exibição adapta-se ao zoom da timeline (era, ano, mês, dia, hora).

### Faixa do mundo
`worlds.time_start` e `worlds.time_end` delimitam o trilho; ajustam-se automaticamente ao criar eventos fora da faixa (com confirmação).

## 3. Tokens e keyframes

### Conceitos
- **Token** (`map_tokens`): uma entidade **num mapa**. Uma entidade pode ter tokens em vários mapas (mundo e cidade), mas no máximo um token por mapa.
- **Keyframe** (`token_keyframes`): `(token_id, tick, x, y, visible, interpolation)`.
- **Ciclo de vida**: token existe entre o primeiro e o último keyframe com `visible = true`. Keyframes `visible = false` "escondem" o token a partir daquele instante (ex.: viagem para outro mapa, morte).

### Regra de avaliação no instante `t`
```
kfs = keyframes do token ordenados por tick
i   = índice do último keyframe com tick ≤ t   (busca binária)
se não existe i            → token oculto (ainda não apareceu)
se kfs[i].visible = false  → oculto
se não existe i+1          → posição = kfs[i] (fica parado)
se kfs[i].interpolation = 'step' → posição = kfs[i]
senão:
  α = (t − kfs[i].tick) / (kfs[i+1].tick − kfs[i].tick)
  posição = lerp(kfs[i], kfs[i+1], ease(α))      // ease padrão: linear
```
- Interpolação: `linear` (padrão), `step` (teletransporte), `ease` (suave). Futuro: `path` (seguir waypoints/estradas).
- Implementação em `domain/timeline/evaluate.ts`, pura e testada; o motor chama por token visível a cada mudança de tempo (O(log n) por token).

### Interações
| Ação | Efeito |
|------|--------|
| Soltar entidade da barra direita no mapa | Cria token (se não houver neste mapa) + keyframe em `currentTick` |
| Arrastar token existente | Upsert do keyframe em `currentTick` (se já houver keyframe no mesmo tick, atualiza) |
| `Alt` + arrastar | Move o keyframe anterior em vez de criar novo (correção de posição) |
| Menu do token → "Sair do mapa aqui" | Cria keyframe `visible=false` em `currentTick` |
| Menu → "Mostrar caminho" | Desenha rastro com pontos dos keyframes; arrastar pontos edita keyframes |
| Menu → "Ir para próximo/anterior keyframe" | Move o slider |
| `Del` | Diálogo: remover keyframe atual · remover token do mapa |

**Snap temporal**: ao criar keyframe, o tick é arredondado à precisão atual da timeline (ex.: zoom em meses → início do dia), configurável.

## 4. Eventos no mapa
- Evento com `location_entity_id` ou `point` aparece como **marcador losango** durante `[tick_start, tick_end]`.
- No trilho da timeline, eventos são losangos (pontuais) ou barras (com duração); clicar move o slider para o início e foca o mapa no local.
- Eventos de categorias filtráveis (batalha, nascimento, viagem, política…) com cor/ícone.

## 5. Ferramentas (barra esquerda)
| Ferramenta | Comportamento | Persistência |
|------------|---------------|--------------|
| **Selecionar** (V) | clique, `Shift` multi, retângulo de seleção, mover tokens | keyframes |
| **Mover mapa** (H) | pan; também com botão do meio, `Espaço`+arrastar, dois dedos | não persiste (câmera salva por usuário/mapa em `ui_prefs`) |
| **Marcar ponto** (P) | clique cria pino com título, ícone, cor e vínculo opcional a entidade/evento | `map_annotations` (`kind='pin'`) |
| **Régua** (R) | cliques encadeados medem segmentos; total na unidade do mapa; `Esc` limpa; opção "fixar medição" | opcional (`kind='measure'`) |
| **Pincel** (B) | traço vetorial suavizado (`perfect-freehand`), cor, espessura, opacidade; borracha | `map_annotations` (`kind='stroke'`) |
| **Região** (G) | polígono preenchido (territórios) | `kind='region'` |
| **Texto** (X) | rótulo livre no mapa | `kind='label'` |

Toda anotação tem `tick_start`/`tick_end` opcionais (nulos = sempre visível). Ex.: a fronteira de um reino desenhada em 300–450 desaparece depois de 450.

## 6. Drag-and-drop barra → mapa
- Itens da barra direita usam **CDK Drag** (`cdkDrag` com `cdkDragPreview` personalizado mostrando o token).
- O canvas não é uma `cdkDropList`; tratamos `cdkDragEnded`/`cdkDragReleased` e verificamos se o ponteiro está sobre o host do canvas (`elementFromPoint` + `contains`).
- Coordenada final: `engine.screenToWorld(event.dropPoint.x, event.dropPoint.y)`.
- Durante o arraste o motor mostra um **fantasma** na posição e destaca se a entidade já tem token neste mapa (nesse caso, o drop cria um keyframe em vez de um token novo).
- Acessibilidade: alternativa por teclado — selecionar item, `Enter` → "Colocar no mapa" → posiciona no centro da viewport; setas movem; `Enter` confirma.

## 7. Linha do tempo (barra inferior)
- `TimelineStore`: `currentTick`, `viewStart`, `viewEnd`, `isPlaying`, `speed` (ticks por segundo reais, com predefinições: 1 dia/s, 1 mês/s, 1 ano/s), `loop`.
- **Play** usa `requestAnimationFrame`; atualiza `currentTick` por delta de tempo real × velocidade.
- Arrastar o cursor atualiza `currentTick` a cada `pointermove` (sem debounce — a avaliação é barata).
- O valor de `t` é refletido na URL (`?t=`) com debounce de 300 ms (`replaceUrl`).
- Zoom na timeline: roda do mouse sobre o trilho (centralizado no ponteiro); pan: arrastar o fundo do trilho.
- Marcadores: eventos, keyframes da entidade selecionada (pequenos traços), "agora da narrativa" (marcador opcional que o autor define como ponto atual da história).
- Componente implementado com **SVG** dentro do Angular (não Pixi), porque são poucas dezenas de elementos e precisam de acessibilidade: o cursor é um `role="slider"` com `aria-valuetext` = data formatada.

## 8. Mapas hierárquicos
- `maps.parent_map_id` forma a árvore (Mundo → Continente → Cidade).
- `map_links`: região poligonal no mapa-pai que abre o mapa-filho (duplo clique ou ícone de lupa).
- O tempo é compartilhado entre mapas (mesmo `currentTick` ao navegar).

## 9. Testes do motor
- `domain/*`: testes unitários exaustivos (interpolação, calendário, geometria, escala).
- `map-engine`: testes com Pixi em modo headless onde possível; testes de contrato da fachada com motor *fake* nos componentes Angular.
- e2e: arrastar entidade → token aparece; mover slider → token muda de posição (verificado via lista acessível espelhada, não por pixels).
