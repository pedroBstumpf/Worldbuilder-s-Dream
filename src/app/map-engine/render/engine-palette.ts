/** Cores e fontes do motor, lidas dos tokens CSS (`palette.css`) para não repetir hex. */
export interface EnginePalette {
  backdrop: string;
  gold: string;
  goldLight: string;
  goldDark: string;
  leather: string;
  leatherDark: string;
  parchment: string;
  parchmentDark: string;
  danger: string;
  /** Anéis padrão por tipo de entidade (docs/05 › Cores por tipo de entidade). */
  bronze: string;
  copper: string;
  brass: string;
  /** Fonte dos rótulos e das iniciais (EB Garamond). */
  fontBook: string;
}

const TOKENS: Record<keyof EnginePalette, string> = {
  backdrop: '--couro-950',
  gold: '--ouro-400',
  goldLight: '--ouro-300',
  goldDark: '--ouro-500',
  leather: '--couro-800',
  leatherDark: '--couro-900',
  parchment: '--pergaminho-50',
  parchmentDark: '--pergaminho-400',
  danger: '--lacre-claro',
  bronze: '--bronze',
  copper: '--cobre',
  brass: '--latao',
  fontBook: '--font-book',
};

/** Lê os tokens no elemento que hospeda o canvas; sem CSS (testes), usa cinza neutro e serifa. */
export function readPalette(host: HTMLElement): EnginePalette {
  const style = getComputedStyle(host);
  const entries = Object.entries(TOKENS).map(([key, token]) => [
    key,
    style.getPropertyValue(token).trim() || (key === 'fontBook' ? 'serif' : '#888888'),
  ]);
  return Object.fromEntries(entries) as unknown as EnginePalette;
}
