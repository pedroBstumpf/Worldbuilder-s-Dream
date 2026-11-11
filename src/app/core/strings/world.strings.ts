/** Textos da tela do mundo (shell do mapa). */
export const WORLD_STRINGS = {
  backToLibrary: 'Voltar à biblioteca',
  loading: 'Abrindo o mundo…',
  noMap: 'Este mundo ainda não tem mapa',
  noMapHint: 'Em breve: arraste a imagem do seu mapa para cá.',
  notFound: 'Este mundo não foi encontrado.',
  loadFailed: 'Não foi possível abrir o mundo.',
  announce: (name: string) => `Mapa: ${name}`,
} as const;
