/** De onde o app lê e grava os dados (docs/10: front primeiro, com adaptadores locais). */
export type DataSource = 'local' | 'supabase';

export interface Environment {
  readonly dataSource: DataSource;
}
