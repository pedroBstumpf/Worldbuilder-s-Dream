/** Textos da página interna /dev (vitrine dos componentes de shared/ui). */
export const DEV_STRINGS = {
  title: 'Componentes de interface',
  intro: 'Página interna de desenvolvimento. Não existe no build de produção.',
  onLeather: 'Sobre couro',
  onParchment: 'Sobre pergaminho',

  buttons: {
    heading: 'Botões',
    primary: 'Abrir mundo',
    secondary: 'Renomear',
    ghost: 'Cancelar',
    danger: 'Excluir',
    small: 'Pequeno',
    disabled: 'Desativado',
  },

  iconButtons: {
    heading: 'Botões de ícone',
    toolbar: 'Ferramentas',
    hint: 'Clique numa ferramenta para ativá-la; passe o ponteiro ou use Tab para ver o tooltip.',
    tools: {
      select: 'Selecionar',
      pan: 'Mover mapa',
      pin: 'Marcar ponto',
      ruler: 'Régua',
      brush: 'Pincel',
      label: 'Rótulo',
    },
    search: 'Buscar',
    settings: 'Configurações',
    library: 'Voltar à biblioteca',
  },

  tooltips: {
    heading: 'Tooltips',
    above: 'Acima',
    below: 'Abaixo',
    left: 'À esquerda',
    right: 'À direita',
    text: 'Dica de exemplo',
  },

  dialogs: {
    heading: 'Diálogos',
    openSimple: 'Diálogo simples',
    openReading: 'Diálogo de leitura',
    openDanger: 'Confirmação destrutiva',
    simpleTitle: 'Renomear mundo',
    simpleBody: 'Um diálogo comum, em couro. O foco fica preso aqui até fechar; Esc fecha.',
    readingTitle: 'Do livro de Valmora',
    readingBody:
      'Diálogos de leitura usam a folha de pergaminho e, quando importantes, cantoneiras ' +
      'douradas. O texto corre em EB Garamond, como nas fichas e nos Docs.',
    dangerTitle: 'Excluir mundo',
    dangerBody: 'O mundo Valmora vai para a lixeira. Dá para desfazer logo depois.',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    close: 'Fechar',
    delete: "Excluir 'Valmora'",
    deleted: 'Mundo excluído',
  },

  toasts: {
    heading: 'Avisos',
    info: 'Informação',
    success: 'Sucesso',
    error: 'Erro',
    withUndo: 'Com Desfazer',
    infoMessage: 'O mapa foi enquadrado.',
    successMessage: 'Mundo salvo.',
    errorMessage: 'Não foi possível salvar. Tente de novo.',
    undoMessage: 'Token removido.',
    undo: 'Desfazer',
    undone: 'Remoção desfeita.',
  },
} as const;
