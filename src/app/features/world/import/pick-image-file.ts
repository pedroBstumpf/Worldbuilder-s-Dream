import { MAP_IMAGE_TYPES } from '@domain/maps';

/**
 * Abre o seletor de arquivos do sistema para uma imagem de mapa (menu "Importar outro
 * mapa"). Resolve com `null` se o usuário cancelar.
 */
export function pickImageFile(document: Document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MAP_IMAGE_TYPES.join(',');
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
