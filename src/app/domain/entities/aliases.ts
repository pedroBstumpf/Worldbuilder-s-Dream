/** Limite de apelidos e etiquetas por entidade e de caracteres em cada um. */
export const ALIAS_MAX_COUNT = 30;
export const ALIAS_MAX_LENGTH = 80;

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Normaliza uma lista de apelidos ou etiquetas: tira espaços extras, descarta vazios,
 * corta no tamanho máximo e remove repetidos (sem diferenciar acento e caixa), mantendo
 * a primeira grafia. `exclude` tira um valor (o próprio nome, no caso dos apelidos).
 */
export function normalizeLabels(values: readonly string[], exclude?: string): string[] {
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, ' ').trim().slice(0, ALIAS_MAX_LENGTH);
    if (!value) continue;
    if (exclude !== undefined && collator.compare(value, exclude.trim()) === 0) continue;
    if (result.some((existing) => collator.compare(existing, value) === 0)) continue;
    result.push(value);
    if (result.length === ALIAS_MAX_COUNT) break;
  }
  return result;
}

/** Separa um texto digitado em vários rótulos (vírgula ou ponto e vírgula). */
export function splitLabels(text: string): string[] {
  return text.split(/[,;]/);
}
