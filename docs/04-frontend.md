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
| Busca no cliente | **MiniSearch** | entidades, eventos e Docs em cache |
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
  { path: '', loadComponent: () => import('@features/book/book-shell.component'), children: [
      { path: '', canMatch: [guestGuard], loadComponent: () => import('@features/book/cover/cover.page') },
      { path: 'convite', loadComponent: () => import('@features/book/cover/invite.page') },          // capa em modo convite (#token)
      { path: 'biblioteca', canMatch: [authGuard], loadComponent: () => import('@features/book/library/library.page') },
  ]},
  { path: 'configuracoes', canMatch: [authGuard], loadChildren: () => import('@features/settings/settings.routes') },
  { path: 'w/:worldId', canMatch: [authGuard], canActivate: [worldAccessGuard],
    loadChildren: () => import('@features/world/world.routes') },
  { path: '**', redirectTo: '' },
];
```
- Usuário com sessão que acessa `/` vai para `/biblioteca` (abertura curta do livro).
- **Modo local (demonstração)**: `provideLocalDataAccess()` registra os adaptadores IndexedDB e o `FakeAuthService` (o botão "Entrar com Google" só simula o login, para as animações funcionarem). O build de produção falha se `dataSource` for `local`.
  - **Banco**: IndexedDB `worldbuilders-dream`, um *object store* por tabela do `docs/07`, com os mesmos modelos. Os adaptadores imitam o banco: `version` +1 e `updatedAt` a cada escrita, `conflict` para versão antiga ou chave única repetida, `not_found` para item ausente ou na lixeira, os padrões e os `check` do DDL (`local-checks.ts`; ao mudar um check numa migração, mude lá também). Nova tabela ou índice: incremente `LOCAL_DB_VERSION` e acrescente um passo no `upgrade`.
  - **Usuário simulado**: "Visitante", com id fixo (os mundos continuam dele depois de sair e entrar). A sessão fica no `localStorage` (`wd:local-session`). Para recomeçar do zero: DevTools › Application › Storage › *Clear site data*.
  - **Atraso e falha simulados**: `provideLocalDataAccess({ latencyMs, failureRate })` atrasa cada operação e faz uma fração delas falhar com `AppError('network')`, para exercitar os estados de carregamento e de erro.
  - **Selo**: o token `DEMO_MODE` (`core/data-source`) fica verdadeiro e o app mostra `wd-demo-badge` ("Modo demonstração · dados só neste navegador") fixo no topo central, por cima do conteúdo, abaixo dos diálogos e sem receber cliques. Quando a barra superior do livro existir, o selo passa para ela. O `DEMO_MODE` serve só para selo e avisos; os dados vêm sempre das portas.
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
- `BookShellComponent` mantém o **livro 3D montado** entre capa e biblioteca; as rotas-filhas só trocam o conteúdo.
- `BookAnimator` (`shared/motion/`) expõe `unclasp()`, `openCover()`, `closeCover()`, `turnPage(direction)`, `zoomIntoPage()` e `skip()`, cada um devolvendo `Promise<void>`. O componente aguarda e então navega.
- Biblioteca → mapa: View Transitions com `view-transition-name: wd-world-map` compartilhado entre a ilustração da página e o host do canvas. `bookViewTransition` **pula** a transição quando a navegação não veio da biblioteca (link direto, botão voltar).
- **Abrir mundo** chama `WorldStore.prefetch(worldId)` **antes** da animação.
- `MotionPreferenceService` combina `prefers-reduced-motion` e a preferência salva (completas/curtas/desligadas) num signal `bookMotion()`.
- Especificação visual: [`docs/05` › Transições do livro](05-design.md#transições-do-livro).

## Componentes de UI próprios (sobre o CDK)
Todos em `shared/ui/`, standalone, `OnPush`, estilizados com Tailwind e tokens `--wd-*`:

| Componente | Base | Notas |
|------------|------|-------|
| `wd-button` / `wd-icon-button` | `<button>` nativo | seletor de atributo (`<button wd-button variant="primary">`); variantes `primary` (ouro), `secondary`, `ghost`, `danger` (lacre), tamanhos `sm`/`md`. `wd-icon-button` exige `label`, que vira `aria-label` e tooltip (sem ele o build falha); `pressed` torna o botão alternável (`aria-pressed`, fundo ouro) |
| `wdTooltip` (diretiva) | CDK Overlay + `AriaDescriber` | painel de couro, texto em caixa-alta (Cinzel); abre no hover (400 ms) e no foco por teclado, fecha com Esc; o ponteiro pode passar sobre o balão; não descreve quando repete o `aria-label` |
| `wd-dialog` + `DialogService` | `@angular/cdk/dialog` | `DialogService.open(Componente, { data })`; o componente usa `<wd-dialog title surface ornate>` e marca as ações com `wdDialogAction`. Foco preso e restaurado, `aria-labelledby` no título, Esc fecha (salvo `disableClose`); superfície couro ou pergaminho; cantoneiras com `ornate` |
| `wd-menu` | `@angular/cdk/menu` | menus de contexto de token e "⋯" |
| `wd-select` / `wd-combobox` | CDK Listbox + Overlay | escolha de tipo, local, calendário |
| `wd-tabs` | `ListKeyManager` (CDK A11y) + roles `tablist`/`tab`/`tabpanel` | abas do Explorar e da ficha |
| `wd-text-field` / `wd-textarea` | `<input>`/`<textarea>` nativos | rótulo sempre visível; erro abaixo do campo |
| `wd-switch` / `wd-checkbox` | elementos nativos estilizados | — |
| `wd-toast` + `ToastService` | CDK Overlay + `LiveAnnouncer` | substitui snackbar; `show({ message, kind, action })`; anuncia uma vez (erro como `assertive`), some em 5 s (8 s com ação), pausa no hover e no foco, no máximo 3; ação "Desfazer" quando couber |
| `wd-popover` | CDK Overlay (posição conectada) | popover do mapa (`docs/05`) |
| `wd-drop-zone` | diretiva própria | área de importação de mapa |
| `wd-demo-badge` | `<span>`s com `role="note"` | selo do modo demonstração; textos por input (`label`, `detail`) |
| `wd-virtual-list` | `cdk-virtual-scroll-viewport` | listas longas do Explorar |

- **Ícones**: `<wd-icon name="…">` (Material Symbols Rounded, peso 300), sempre `aria-hidden`; o nome acessível fica no controle.
- **Textos dentro de `shared/ui`** ("Fechar", "Dispensar aviso"): `shared` não importa `core`, então os componentes leem o token `WD_UI_STRINGS`, fornecido no `app.config` com `provideUiStrings(UI_STRINGS)` a partir de `core/strings`.
- **Vitrine `/dev`** (`features/dev`): todos os componentes sobre couro e pergaminho, para conferir visual, teclado e leitor de tela. A rota só existe com `ngDevMode`; o build de produção remove a rota e o chunk.

Acompanhar o **Angular Aria** (componentes acessíveis sem estilo do próprio Angular): se estiver estável, pode substituir as implementações próprias de abas, listbox, combobox e menu.

## Estado
| Store | Escopo | Conteúdo |
|-------|--------|----------|
| `SessionStore` | raiz | usuário, perfil, preferências (barras, tema, animações do livro) |
| `WorldStore` | rota `w/:worldId` | mundo, calendário, entidades, eventos, mapas, membros, Docs vinculados |
| `MapStore` | rota `w/:worldId` | cena do mapa ativo (tokens, keyframes, anotações), seleção |
| `TimelineStore` | rota `w/:worldId` | `currentTick`, faixa visível, zoom, `isPlaying`, velocidade |
| `ToolStore` | rota `w/:worldId` | ferramenta ativa e opções |
| `HistoryStore` | rota `w/:worldId` | desfazer/refazer (padrão Command) |

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
- Larguras redimensionáveis (CDK Drag no eixo X), salvas em `profiles.ui_prefs`.
- Recolher/expandir anima `transform`, nunca `width`.
- **Mundo sem mapa**: o canvas dá lugar à área de importação ([`docs/06` §0](06-mapa-e-tempo.md#0-importar-o-mapa-arrastar-e-soltar)).
- A ficha da entidade abre como painel deslizante sobre o Explorar (desktop) ou folha inferior (tablet).

### Atalhos
Registrados num `ShortcutService` com escopo, desativados quando um campo de texto tem foco.

| Tecla | Ação |
|-------|------|
| `V` | Selecionar |
| `H` / `Espaço` (segurar) | Mover mapa |
| `P` | Marcar ponto |
| `R` | Régua |
| `B` | Pincel |
| `G` | Região |
| `X` | Rótulo |
| `[` / `]` | Recolher barra esquerda / direita |
| `T` | Foco na linha do tempo |
| `←` / `→` | Passo de tempo (`Shift`: passo grande) |
| `K` | Play/pause |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` | Desfazer / refazer |
| `Ctrl/Cmd+K` | Busca e paleta de comandos |
| `Ctrl/Cmd+V` (com imagem) | Importar imagem como mapa |
| `Del` | Remover keyframe ou token (com confirmação) |
| `Esc` | Pular animação do livro; cancelar ferramenta |

## Textos
### Nativo (Tiptap)
- Extensões: StarterKit, Link (protocolos `https:` e `mailto:`), Image (só imagens do próprio mundo), Placeholder, CharacterCount e **Mention** (`@` para citar entidades → `entity_mentions`).
- Salvo como JSON em `content`; texto puro em `content_text` para busca.
- Carregado com `@defer (on interaction)`.

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
- O canvas expõe uma **lista acessível espelhada** dos tokens visíveis no instante atual.
- `prefers-reduced-motion` respeitado em todas as animações.
- Contraste AA verificado e foco sempre visível (`docs/05`).

## Erros
- `AppErrorHandler`: aviso genérico (`wd-toast`) e registro no console. Sentry (plano gratuito) pode ser ligado depois, se fizer falta.
- `data-access` converte erros do Supabase e do Google em `AppError` com código estável (`docs/02`).
