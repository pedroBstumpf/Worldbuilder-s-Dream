/**
 * Abre o seletor de arquivos do sistema (`accept` como no `<input type="file">`).
 * Resolve com `null` se o usuário cancelar.
 */
export function pickFile(document: Document, accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Baixa `content` como um arquivo chamado `fileName`. */
export function downloadFile(document: Document, fileName: string, content: Blob): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // O download começa depois do clique; revogar já cancelaria em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
