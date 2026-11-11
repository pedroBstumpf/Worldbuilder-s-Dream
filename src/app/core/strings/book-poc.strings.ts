/** Textos da prova de conceito do livro, página interna /dev/livro (F0-07). */
export const BOOK_POC_STRINGS = {
  title: 'Prova de conceito do livro',
  intro:
    'Capa → abertura → virada de página, em CSS 3D com Web Animations. ' +
    'Clique na cena, Esc ou Enter pulam a animação.',
  scene: 'Livro',

  cover: {
    title: "Worldbuilder's Dream",
    tagline: 'Um atlas para os seus mundos',
    signIn: 'Entrar (simulado)',
    signingIn: 'Entrando…',
  },

  library: {
    heading: 'Sumário',
    exLibris: 'Ex-libris de quem testa',
    worlds: [
      { name: 'Valmora', date: '3 nov.' },
      { name: 'Ilhas de Sal', date: '28 out.' },
      { name: 'O Vale Partido', date: '12 out.' },
    ],
    worldName: 'Valmora',
    worldDescription: 'Reinos de rios e torres, do Primeiro Degelo à Queda de Aster.',
    worldCounts: '12 personagens · 8 locais · 21 eventos',
    open: 'Abrir mundo',
  },

  map: {
    title: 'Mapa de Valmora',
    note: 'Aqui entraria o zoom para o canvas do mapa (View Transition, F0-08/F1-12).',
  },

  announce: {
    library: 'Biblioteca de mundos',
    map: 'Mapa: Valmora',
  },

  controls: {
    heading: 'Controles e medição',
    variant: 'Virada de página',
    variants: { rigid: 'Rígida (um plano)', curl: 'Curvada (faixas)' },
    mode: 'Transições',
    modes: {
      full: 'Completas',
      short: 'Curtas',
      fade: 'Fade (movimento reduzido)',
      off: 'Desligadas',
    },
    reset: 'Recomeçar',
    state: 'Estado',
    results: 'Quadros por etapa',
    empty: 'Nenhuma etapa medida ainda.',
    columns: {
      phase: 'Etapa',
      duration: 'Duração (ms)',
      fps: 'fps médio',
      p95: 'p95 (ms)',
      worst: 'Pior quadro (ms)',
      long: 'Quadros longos',
      first: '1º quadro (ms)',
    },
  },
} as const;
