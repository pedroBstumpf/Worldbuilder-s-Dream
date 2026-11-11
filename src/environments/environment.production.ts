import type { Environment } from './environment.model';

/**
 * Produção: substitui environment.ts no build de produção (angular.json › fileReplacements).
 * O modo local nunca vai para produção (AGENTS.md): o tipo abaixo só aceita 'supabase',
 * então trocar para 'local' quebra o build.
 */
export const environment = {
  dataSource: 'supabase',
} as const satisfies Environment & { readonly dataSource: 'supabase' };
