# 04 — Front-end

## Stack
| Item | Escolha | Observação |
|------|---------|-----------|
| Framework | **Angular 22** | Standalone, **zoneless**, signals. Atualizar com `ng update` a cada minor; majors agora são anuais. |
| Build | `@angular/build` (esbuild + Vite) | Necessário para o Tailwind v4 via PostCSS. |
| Comportamento de UI | **Angular CDK** | Overlay, Dialog, Menu, Listbox, Drag and Drop, A11y, Scrolling, Clipboard, Layout. Ver [ADR-0002](adr/0002-cdk-e-tailwind-sem-material.md). |
| Estilo | **Tailwind CSS v4** | Todo o visual; tokens do design system em CSS (`docs/05`). Sem Sass. |
| Animações | Componentes **Skiper UI** e **Magic UI** portados + CSS 3D + Web Animations/`motion` (vanilla) + View Transitions | [ADR-0003](adr/0003-skiper-ui-e-magic-ui-portados-para-angular.md), [ADR-0011](adr/0011-navegacao-como-livro.md) |
| Estado | **NgRx SignalStore** | [ADR-0009](adr/0009-ngrx-signalstore-para-estado.md) |
| Formulários | Reactive Forms tipados | Poucos formulários (mundo, entidade, evento, calendário, escala). Avaliar Signal Forms quando estáveis. |
| Texto nativo | **Tiptap** | [ADR-0010](adr/0010-tiptap-como-editor.md) |
| Google Docs | Docs API + conversor próprio para Tiptap | `docs/08` |
| Mapa | **PixiJS v8 + pixi-viewport** | `docs/06` |
| Busca no cliente | **MiniSearch** | entidades, eventos e Docs em cache; `WorldSearch` (`domain/search`): prefixo, tolerância a erros, sem acento e caixa; nome pesa mais que apelidos, que pesam mais que o texto |
| Textos da interface | Constantes em pt-BR (`core/strings`) | Sem biblioteca de i18n |
| Ícones | **Material Symbols Rounded** (fonte variável auto-hospedada; é só um conjunto de ícones, independente do Angular Material) + SVGs próprios | Peso 300, preenchimento 0 nas barras |
| Testes | Vitest, Angular Testing Library, Playwright | `docs/03` |

## Configuração do app
```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated: bookViewTransition }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withFetch()),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    { provide: SUPABASE_CLIENT, useFactory: createSupabaseClient },
    // portas → implementações escolhidas no build (docs/10: front primeiro)
    ...provideDataAccess(),
  ],
};
```
- `provideDataAccess()` (`data-access/provide-data-access.ts`) escolhe os adaptadores por `environment.dataSource`. No build de produção, `angular.json › fileReplacements` troca esse arquivo por `provide-data-access.production.ts`, que **não importa** `data-access/local`: o IndexedDB e o login simulado ficam fora do bundle de produção.

## Rotas
```ts
export const routes: Routes = [
  // O livro: um único BookShell persistente com dois estados (capa e biblioteca)
  // O livro: um único BookShell persistente. As filhas só escolhem a página e aplicam os guards
  // (não têm componente); `pathMatch: 'full'` impede a capa de casar por prefixo com /biblioteca.
  { path: '', loadComponent: () => import('@features/book/book-shell.component'), children: [
      { path: '', pathMatch: 'full', canMatch: [guestGuard], children: [] },
      { path: 'convite', children: [] },                                   // capa em modo convite (#token), Fase 2
      { path: 'biblioteca', canMatch: [authGuard], children: [] },
  ]},
  { path: 'configuracoes', canMatch: [authGuard], loadChildren: () => import('@features/settings/settings.routes') },
  { path: 'w/:worldId', canMatch: [authGuard], canActivate: [worldAccessGuard],
    loadChildren: () => import('@features/world/world.routes') },
  { path: '**', redirectTo: '' },
];
```
- Usuário com sessão que acessa `/` vai para `/biblioteca` (abertura curta do livro): o `guestGuard` redireciona e marca a chegada `resume`.
- **Modo local (demonstração)**: `provideLocalDataAccess()` registra os adaptadores IndexedDB e o `FakeAuthService` (o botão "Entrar com Google" só simula o login, para as animações funcionarem). O build de produção falha se `dataSource` for `local`.
  - **Banco**: IndexedDB `worldbuilders-dream`, um *object store* por tabela do `docs/07`, com os mesmos modelos. Os adaptadores imitam o banco: `version` +1 e `updatedAt` a cada escrita, `conflict` para versão antiga ou chave única repetida, `not_found` para item ausente ou na lixeira, os padrões e os `check` do DDL (`local-checks.ts`; ao mudar um check numa migração, mude lá também). Nova tabela ou índice: incremente `LOCAL_DB_VERSION` e acrescente um passo no `upgrade`.
  - **Usuário simulado**: "Visitante", com id fixo (os mundos continuam dele depois de sair e entrar). A sessão fica no `localStorage` (`wd:local-session`). Para recomeçar do zero: DevTools › Application › Storage › *Clear site data*.
  - **Atraso e falha simulados**: `provideLocalDataAccess({ latencyMs, failureRate })` atrasa cada operação e faz uma fração delas falhar com `AppError('network')`, para exercitar os estados de carregamento e de erro.
  - **Selo**: o token `DEMO_MODE` (`core/data-source`) fica verdadeiro e o app mostra `wd-demo-badge` ("Modo demonstração · dados só neste navegador") fixo no topo central do livro, por cima do conteúdo, abaixo dos diálogos e sem receber cliques. Na tela do mundo, o selo fica dentro da barra superior (`<wd-demo-badge inline>`). O `DEMO_MODE` serve só para selo e avisos; os dados vêm sempre das portas.
- Estado compartilhável na URL do mundo: `/w/:worldId?map=<id>&t=<tick>&sel=<entityId>`.
- `worldAccessGuard` só melhora a UX; **a segurança real é o RLS**.

### Capa (login)
- Um único botão **Entrar com Google** na placa da capa (`docs/05`).
- Ao voltar do Google: se o hook recusou o e-mail, a URL traz o erro e a placa mostra "Este e-mail não tem acesso a este livro" (sem criar conta). Se aceitou: `google-connect` → animação de abertura → `/biblioteca`.

### Capa em modo convite (`/convite#token`)
1. Lê o token do fragmento e **remove-o da barra de endereço** (`history.replaceState`).
2. Chama `check-invite`: válido → a placa mostra "Você foi convidado para este livro", o e-mail convidado e os mundos incluídos; inválido → mensagem `invite_invalid`.
3. **Aceitar e entrar com Google** → `accept-invite` → `signInWithOAuth` com `queryParams: { login_hint: <e-mail convidado> }`, para o Google já sugerir a conta certa.
4. Se a pessoa escolher outra conta, o hook recusa e a capa mostra `wrong_account`, com o botão para tentar de novo.

### Configurações › Pessoas (só administrador)
- Lista de quem tem acesso (nome, e-mail, último acesso) e de convites pendentes (validade).
- **Convidar**: e-mail + mundos opcionais (como editor) → `send-invite`. Depois de enviar, aparece **Copiar link do convite** (alternativa se o e-mail cair no spam).
- Ações: reenviar (gera token novo e invalida o anterior), cancelar convite, **revogar acesso** (confirmação destrutiva com o e-mail da pessoa).
- O item de menu só aparece quando `is_app_admin()` é verdadeiro (a proteção real está nas Edge Functions).

### Transições do livro
- `BookShellComponent` (`features/book`) mantém o **livro 3D montado** entre capa e biblioteca. Ele próprio desenha a capa (`wd-cover-plaque`), o sumário (`wd-library-contents`, verso da capa), o frontispício (`wd-world-frontispiece`, folha direita) e a página do mapa (sob a folha); o `LibraryStore` (fornecido no shell) lista e cria mundos. A página vem da URL de destino (`router.currentNavigation()`), não do `snapshot` da filha, que ainda não existe no construtor.
- `BookAnimator` (`shared/motion/`) expõe `spinRose(work)`, `open(motion, { clasp })`, `close(motion)`, `turnPage('forward' | 'back', motion)`, `skip()`, `clear()` e `cancel()`; as etapas devolvem `Promise<void>`. O estado em repouso vem do CSS (`data-cover`, `data-leaf`); o animador grava o final inline e `clear()` devolve o controle ao CSS depois que o componente pinta o novo estado. O componente aguarda e então navega.
- **Chegadas**: `BookTransitions` (`core/motion`) guarda, só em memória e para uma navegação, como a próxima tela chega: `resume` (abertura curta), `zoom-in` (biblioteca → mapa) ou `zoom-out` (mapa → biblioteca). Sem marca (link direto, recarga, botão voltar), a tela abre sem animação.
- Biblioteca → mapa: View Transitions com `view-transition-name: wd-world-map` compartilhado entre a moldura da página do mapa e o host do mapa. `bookViewTransition` (`core/motion`) **pula** a transição sem chegada `zoom-*` ou no movimento reduzido (a tela do mundo faz um fade de 150 ms) e marca `<html data-book-zoom>` para o CSS escolher a duração. Clique, Esc ou Enter pulam o zoom. Em desenvolvimento, o Router registra um `AbortError` no console a cada transição pulada; é esperado.
- **Abrir mundo** chama `WorldPrefetch.prefetch(worldId)` (`core/world`) **antes** da animação; a tela do mundo recebe a mesma Promise com `take()`. Vira parte do `WorldStore` quando ele existir.
- `BookMotionService` (`core/motion`) dá o signal `motion()`: `full` sempre; `fade` com `prefers-reduced-motion`; `short` depois que `watchLowFps` (`shared/motion/low-fps.ts`) detecta fps baixo (até o fim da sessão). Não há preferência no app.
- Especificação visual: [`docs/05` › Transições do livro](05-design.md#transições-do-livro).

## Componentes de UI próprios (sobre o CDK)
Todos em `shared/ui/`, standalone, `OnPush`, estilizados com Tailwind e tokens `--wd-*`:

| Componente | Base | Notas |
|------------|------|-------|
| `wd-button` / `wd-icon-button` | `<button>` nativo | seletor de atributo (`<button wd-button variant="primary">`); variantes `primary` (ouro), `secondary`, `ghost`, `danger` (lacre), tamanhos `sm`/`md`. `wd-icon-button` exige `label`, que vira `aria-label` e tooltip (sem ele o build falha); `pressed` torna o botão alternável (`aria-pressed`, fundo ouro) |
| `wdTooltip` (diretiva) | CDK Overlay + `AriaDescriber` | painel de couro, texto em caixa-alta (Cinzel); abre no hover (400 ms) e no foco por teclado, fecha com Esc; o ponteiro pode passar sobre o balão; não descreve quando repete o `aria-label` |
| `wd-dialog` + `DialogService` | `@angular/cdk/dialog` | `DialogService.open(Componente, { data })`; o componente usa `<wd-dialog title surface ornate>` e marca as ações com `wdDialogAction`. Foco preso e restaurado, `aria-labelledby` no título, Esc fecha (salvo `disableClose`); superfície couro ou pergaminho; cantoneiras com `ornate` |
| `wd-menu` | `@angular/cdk/menu` | menus de contexto de token e "⋯"; por enquanto, as classes globais `.wd-menu`, `.wd-menu-item` e `.wd-menu-heading` sobre `cdkMenu`. O menu do token (`wd-token-menu`) abre com `CdkContextMenuTrigger.open({ x, y })` no `contextmenu` nativo (antes dele, o CDK o fecharia como clique fora) |
| `wd-select` / `wd-combobox` | CDK Listbox + Overlay | escolha de tipo, local, calendário |
| `wd-tabs` | roles `tablist`/`tab`/`tabpanel`, foco itinerante | abas do Explorar (ícone + rótulo) e da ficha (texto); ativação automática, setas, Home e End; `tabId()`/`tabPanelId()` ligam aba e painel |
| `wd-text-field` / `wd-textarea` | `<input>`/`<textarea>` nativos | rótulo sempre visível; erro abaixo do campo |
| `wd-switch` / `wd-checkbox` | elementos nativos estilizados | — |
| `wd-toast` + `ToastService` | CDK Overlay + `LiveAnnouncer` | substitui snackbar; `show({ message, kind, action })`; anuncia uma vez (erro como `assertive`), some em 5 s (8 s com ação), pausa no hover e no foco, no máximo 3; ação "Desfazer" quando couber |
| `wd-popover` | CDK Overlay (posição conectada) | popover do mapa (`docs/05`) |
| `wd-drop-zone` | diretiva própria | área de importação de mapa |
| `wd-demo-badge` | `<span>`s com `role="note"` | selo do modo demonstração; textos por input (`label`, `detail`) |
| (lista virtual) | `cdk-virtual-scroll-viewport` direto no Explorar | linhas de altura fixa (52 px); sem componente próprio enquanto houver um só uso |

- **Ícones**: `<wd-icon name="…">` (Material Symbols Rounded, peso 300), sempre `aria-hidden`; o nome acessível fica no controle.
- **Textos dentro de `shared/ui`** ("Fechar", "Dispensar aviso"): `shared` não importa `core`, então os componentes leem o token `WD_UI_STRINGS`, fornecido no `app.config` com `provideUiStrings(UI_STRINGS)` a partir de `core/strings`.
- **Vitrine `/dev`** (`features/dev`): todos os componentes sobre couro e pergaminho, para conferir visual, teclado e leitor de tela. A rota só existe com `ngDevMode`; o build de produção remove a rota e o chunk.

Acompanhar o **Angular Aria** (componentes acessíveis sem estilo do próprio Angular): se estiver estável, pode substituir as implementações próprias de abas, listbox, combobox e menu.

## Estado
| Store | Escopo | Conteúdo |
|-------|--------|----------|
| `SessionStore` | raiz | usuário (`core/auth`, NgRx SignalStore sobre a porta `AuthService`) |
| `UiPrefsStore` | raiz | `profiles.ui_prefs` pela porta `ProfileRepository` (`core/prefs`): barras e câmera por mapa; muda na hora e grava em lote depois de 800 ms |
| `WorldStore` | rota `w/:worldId` | mundo, calendário, faixa do mundo, mapas (árvore, mapa ativo, importação e envio em segundo plano); depois membros, Docs |
| `EntityStore` | rota `w/:worldId` | entidades do mundo, ficha aberta (`?sel=`), retratos, status de gravação e o índice de busca (`WorldSearch`, que inclui os eventos) |
| `EventStore` | rota `w/:worldId` | eventos da linha do tempo, ficha do evento aberta (também em `?sel=`), status de gravação |
| `MapStore` | rota `w/:worldId` | cena do mapa ativo (links, pontos dos eventos, tokens, keyframes e anotações) e seleção de tokens. Anotações são gravadas com a `version` que a cena guarda (o repositório devolve a nova). Toda edição é um `SceneChange` (o que pôr e o que remover, `domain/maps`): aplicada na hora, gravada e registrada no `HistoryStore` com a inversa; se a gravação falha, desfaz o que passou e relê a cena |
| `TimelineStore` | rota `w/:worldId` | `currentTick`, faixa visível, zoom, `isPlaying`, velocidade, repetição |
| `ToolStore` | rota `w/:worldId` | ferramenta ativa e opções |
| `HistoryStore` | rota `w/:worldId` | desfazer/refazer das edições do mapa (padrão Command, até 100): edições, desfazer e refazer rodam em fila; esquece tudo ao trocar de mapa. `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` e `Ctrl+Y` anunciam o que foi desfeito |
| `TokenActions` | rota `w/:worldId` (serviço) | ações de token vindas do mapa, do menu e da ficha: escolhe o instante (snap), chama a `MapStore`, anuncia o resultado e avisa falhas |

```ts
export const MapStore = signalStore(
  withState<MapState>({ mapId: null, tokens: {}, keyframes: {}, annotations: {}, selection: [] }),
  withComputed(({ tokens }) => ({ tokenList: computed(() => Object.values(tokens())) })),
  withMethods((store, repo = inject(MAP_REPOSITORY), history = inject(HistoryStore)) => ({
    async placeToken(entityId: string, at: Point, tick: number) {
      await history.execute(new PlaceTokenCommand(store, repo, { entityId, at, tick }));
    },
  })),
);
```
Regras:
- **Atualização otimista** em todas as edições do mapa, com reversão e aviso em caso de falha.
- **Autosave com debounce** (400–800 ms); não há botão "Salvar" no mapa.
- **Concorrência** entre usuários: coluna `version`; conflito → recarrega o item e avisa.
- RxJS só onde agrega; leitura dependente de signals com `resource()`/`rxResource()`.

## Layout VTT (`features/world/shell`)
- `<wd-map-canvas>` em `position: fixed; inset: 0`.
- Barras como overlays com `pointer-events` só nelas; o resto passa eventos ao canvas.
- Larguras redimensionáveis (CDK Drag no eixo X; setas na alça, que é um `separator`), salvas em `profiles.ui_prefs`.
- O motor recebe a área coberta pelas barras (`setInsets`) para enquadrar o mapa na parte livre.
- **Explorar** (M2): abas Personagens, Locais, **Acervo** (facções, itens e notas, com filtro por tipo), Eventos (por data, com a data no calendário do mundo; abre a ficha do evento) e História (vazia até os Google Docs). Filtro pela busca do mundo (mostra o apelido que casou), botão `+` com o tipo da aba (na aba Eventos, "Novo evento") e lista virtual. As linhas de entidade são arrastáveis (`application/x-wd-entity`) e o mapa aceita o arraste: cria o token ou uma posição no instante ([`docs/06` §6](06-mapa-e-tempo.md#6-drag-and-drop-barra--mapa)).
- **Linha do tempo** (M3, `wd-timeline-bar`): barra inferior de 88 px, de borda a borda; as barras laterais, as fichas e os avisos terminam acima dela (`--wd-bottom-bar`, `--wd-toast-offset`) e o motor a recebe como margem inferior. Detalhes em [`docs/06` §7](06-mapa-e-tempo.md#7-linha-do-tempo-barra-inferior).
- **Ficha do evento** (`wd-event-sheet`): mesma página da ficha de entidade (estilos comuns em `entities/sheet.css`); só uma ficha fica aberta por vez. O autosave das duas usa o `Autosaver` (`state/autosave.ts`).
- **Ficha** (`wd-entity-sheet`): página de pergaminho sobre o Explorar (mínimo 440 px), com retrato, nome, status ("Salvando…", "Salvo") e as abas **Resumo** (subtítulo, tipo, cor do anel, apelidos, etiquetas, **No mapa** — `wd-entity-map-section`, as posições no mapa aberto, M4 —, "Citada em", lixeira) e **Texto** (editor). Esc fecha e devolve o foco à linha. Relações, Aparições e Documentos chegam com os marcos que os alimentam.
- **Autosave da ficha**: a `EntityStore` aplica a edição na hora e grava 600 ms depois da última mudança, uma gravação por vez por entidade. Conflito recarrega a entidade e avisa; outras falhas guardam a edição e oferecem "Tentar de novo". A lixeira mostra "Desfazer".
- **Retrato**: o arquivo passa pelas mesmas checagens do mapa, vira um quadrado de até 512 px em WebP (sem EXIF) e vai para a porta `AssetRepository`; o anterior é apagado.
- **Paleta `Ctrl/Cmd+K`** (também a lupa da barra superior): combobox com Entidades, Eventos, Comandos (criar entidade, enquadrar, Explorar, biblioteca) e Mapas.
- Recolher/expandir anima `transform`, nunca `width`.
- **Mundo sem mapa**: o canvas dá lugar à área de importação ([`docs/06` §0](06-mapa-e-tempo.md#0-importar-o-mapa-arrastar-e-soltar)).
- A ficha da entidade abre como painel deslizante sobre o Explorar (desktop) ou folha inferior (tablet).

### Atalhos
Registrados num `ShortcutService` (`core/shortcuts`) com escopo, desativados quando um campo de texto tem foco e dentro de diálogos. `when` limita um atalho a um estado (Enter e Esc só durante o desenho; Espaço não rouba o clique de botões).

| Tecla | Ação |
|-------|------|
| `V` | Selecionar |
| `H` / `Espaço` (segurar) | Mover mapa |
| `P` | Marcar ponto |
| `R` | Régua |
| `B` | Pincel |
| `E` | Borracha |
| `G` | Região |
| `X` | Rótulo |
| `[` / `]` | Recolher barra esquerda / direita |
| `T` | Foco na linha do tempo |
| `←` / `→` | Passo de tempo (`Shift`: passo grande) |
| `K` | Play/pause |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` (ou `Ctrl+Y`) | Desfazer / refazer (edições do mapa) |
| `Ctrl/Cmd+K` | Busca e paleta de comandos |
| `Ctrl/Cmd+V` (com imagem) | Importar imagem como mapa |
| `Enter` / `Esc` (desenhando) | Fechar o polígono do link / cancelar a ferramenta |
| Setas, `+`, `−`, `0` (foco no mapa) | Mover, aproximar, afastar, enquadrar |
| `Del` | Remover keyframe ou token (com confirmação) |
| `Esc` | Pular animação do livro; cancelar ferramenta |

## Textos
### Nativo (Tiptap)
- Extensões: StarterKit (títulos 2 e 3, sem código), Link (protocolos `https:` e `mailto:`), Placeholder, CharacterCount e **Mention** (`@` lista entidades por nome ou apelido → `entity_mentions`). Image (só imagens do próprio mundo) fica para quando houver inserção de imagens no texto.
- Salvo como JSON em `content`; texto puro em `content_text` (`richTextToPlain`, em `domain/entities`) para busca. Texto vazio grava `null`. Ao gravar, a `EntityStore` regrava as menções do texto pela porta `MentionRepository`.
- Carregado com `@defer` ao abrir a aba Texto, num chunk próprio.
- Clicar numa menção com o editor fora de foco (ou com `Ctrl`) abre a ficha citada.

### Google Doc
- Renderizado pelo mesmo esquema Tiptap, **somente leitura**, a partir do conversor em `domain/gdocs/` (`docs/08`).
- Camadas: nomes de entidades como links, datas como âncoras de tempo, sumário lateral.
- Botão **Editar no Google Docs**; ao voltar ao app, recarrega se o `revisionId` mudou.

## Desempenho
- Lazy loading por feature; `@defer` em ficha, editor, configurações do mapa e Picker.
- PixiJS e Tiptap em chunks separados. Na biblioteca, o chunk do mapa é pré-carregado (`@defer (on idle)`) para a virada de página não esperar o download.
- Camadas da capa em WebP/AVIF, pré-carregadas na rota `/`; peso total da capa ≤ 400 kB.
- Listas longas com `cdk-virtual-scroll-viewport`.
- Orçamentos em `angular.json`: inicial 300 kB gzip.
- Durante arraste do slider ou do mapa: **nenhuma** chamada de rede e nenhuma atualização de template por quadro.

## Acessibilidade
- Componentes próprios seguem os padrões WAI-ARIA, com o CDK cuidando de foco, teclado e anúncios.
- O canvas expõe uma **lista acessível espelhada** dos tokens visíveis no instante atual (M4). Já no M1, os links do mapa viram botões ("Abrir mapa: …") que aparecem ao receber foco.
- `prefers-reduced-motion` respeitado em todas as animações.
- Contraste AA verificado e foco sempre visível (`docs/05`).

## Erros
- `AppErrorHandler`: aviso genérico (`wd-toast`) e registro no console. Sentry (plano gratuito) pode ser ligado depois, se fizer falta.
- `data-access` converte erros do Supabase e do Google em `AppError` com código estável (`docs/02`).
