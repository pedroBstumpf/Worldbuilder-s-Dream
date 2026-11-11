/** Cores do motor, lidas dos tokens CSS (`palette.css`) para não repetir hex. */
export interface EnginePalette {
  backdrop: string;
  gold: string;
  goldLight: string;
  goldDark: string;
  leather: string;
  parchment: string;
  danger: string;
}

const TOKENS: Record<keyof EnginePalette, string> = {
  backdrop: '--couro-950',
  gold: '--ouro-400',
  goldLight: '--ouro-300',
  goldDark: '--ouro-500',
  leather: '--couro-800',
  parchment: '--pergaminho-50',
  danger: '--lacre-claro',
};

/** Lê os tokens no elemento que hospeda o canvas; sem CSS (testes), usa cinza neutro. */
export function readPalette(host: HTMLElement): EnginePalette {
  const style = getComputedStyle(host);
  const entries = Object.entries(TOKENS).map(([key, token]) => [
    key,
    style.getPropertyValue(token).trim() || '#888888',
  ]);
  return Object.fromEntries(entries) as unknown as EnginePalette;
}
