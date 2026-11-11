const FORMAT = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

/** Data da última edição no sumário, como num índice: "3 de nov." */
export function formatEditDate(iso: string): string {
  return FORMAT.format(new Date(iso));
}
