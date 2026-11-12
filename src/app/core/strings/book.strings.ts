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
    archivedOn: (date: string) => `Arquivado em ${date}`,
    trashedOn: (date: string) => `Na lixeira desde ${date}`,
    signOut: 'Sair',
    importWorld: 'Importar mundo',
    views: 'Listas de mundos',
    viewNames: { worlds: 'Mundos', archived: 'Arquivados', trash: 'Lixeira' },
    viewCount: (name: string, count: number) => (count > 0 ? `${name} (${count})` : name),
    noWorlds: 'Nenhum mundo no sumário.',
    noArchived: 'Nenhum mundo arquivado.',
    noTrash: 'A lixeira está vazia.',
    trashHint: 'Mundos na lixeira ficam aqui até você excluí-los para sempre.',
    actionsFor: (name: string) => `Ações de ${name}`,
    actions: {
      rename: 'Renomear',
      duplicate: 'Duplicar',
      export: 'Exportar (JSON)',
      archive: 'Arquivar',
      unarchive: 'Desarquivar',
      trash: 'Mover para a lixeira',
      restore: 'Restaurar',
      delete: 'Excluir para sempre',
    },
  },

  /** Avisos das ações da biblioteca (nomes entre aspas curvas). */
  libraryToasts: {
    undo: 'Desfazer',
    renamed: (name: string) => `Mundo renomeado para “${name}”.`,
    duplicated: (name: string) => `Cópia criada: “${name}”.`,
    exported: (file: string) => `Mundo exportado: ${file}`,
    imported: (name: string) => `“${name}” foi importado.`,
    archived: (name: string) => `“${name}” foi para os arquivados.`,
    unarchived: (name: string) => `“${name}” voltou para o sumário.`,
    trashed: (name: string) => `“${name}” foi para a lixeira.`,
    restored: (name: string) => `“${name}” voltou para o sumário.`,
    deleted: (name: string) => `“${name}” foi excluído para sempre.`,
    invalidFile: 'Este arquivo não é um mundo exportado do Worldbuilder’s Dream.',
    failed: 'Não foi possível concluir. Tente de novo.',
  },

  /** Sufixo do nome da cópia ao duplicar. */
  copyName: (name: string) => `${name} (cópia)`,

  deleteWorld: {
    title: 'Excluir para sempre?',
    question: (name: string) =>
      `“${name}” e tudo o que há nele (mapas, fichas, eventos e imagens) serão apagados deste navegador. Não dá para desfazer.`,
    hint: 'Para guardar uma cópia, restaure o mundo e exporte-o antes.',
    cancel: 'Cancelar',
    confirm: 'Excluir para sempre',
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

  renameWorld: {
    title: 'Renomear mundo',
    save: 'Salvar',
  },

  announce: {
    cover: "Capa do livro Worldbuilder's Dream",
    library: 'Biblioteca de mundos',
  },
} as const;
