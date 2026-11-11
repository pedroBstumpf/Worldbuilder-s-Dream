/** Textos do livro: capa, biblioteca e criação de mundo (docs/05 › Transições do livro). */
export const BOOK_STRINGS = {
  scene: 'Livro de mundos',

  cover: {
    title: "Worldbuilder's Dream",
    tagline: 'Um atlas para os seus mundos',
    signIn: 'Entrar com Google',
    signingIn: 'Entrando…',
    notAllowed: 'Este e-mail não tem acesso a este livro',
    failed: 'Não foi possível entrar. Tente de novo.',
  },

  library: {
    heading: 'Sumário',
    exLibris: (name: string) => `Ex-libris de ${name}`,
    loading: 'Abrindo o livro…',
    loadFailed: 'Não foi possível ler os seus mundos.',
    retry: 'Tentar de novo',
    empty: 'Seu livro está em branco',
    emptyHint: 'Cada mundo ganha a sua página: mapas, personagens, locais e a linha do tempo.',
    createFirst: 'Criar primeiro mundo',
    createNew: 'Criar novo mundo',
    open: 'Abrir mundo',
    noDescription: 'Um mundo ainda sem descrição.',
    edited: (date: string) => `Editado em ${date}`,
    signOut: 'Sair',
  },

  mapPage: {
    noMap: 'Este mundo ainda não tem mapa',
  },

  createWorld: {
    title: 'Criar mundo',
    name: 'Nome do mundo',
    description: 'Descrição',
    descriptionHint: 'Opcional. Aparece no frontispício do mundo.',
    nameRequired: 'Dê um nome ao mundo.',
    tooLong: (max: number) => `Use até ${max} caracteres.`,
    cancel: 'Cancelar',
    create: 'Criar mundo',
    failed: 'Não foi possível criar o mundo. Tente de novo.',
  },

  announce: {
    cover: "Capa do livro Worldbuilder's Dream",
    library: 'Biblioteca de mundos',
  },
} as const;
