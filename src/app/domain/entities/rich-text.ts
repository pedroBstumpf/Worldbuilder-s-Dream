import type { Uuid } from '../models/common';
import type { RichTextDoc, RichTextNode } from '../models/rich-text';

/** Nó de menção (`@entidade`) do Tiptap: `{ type: 'mention', attrs: { id, label } }`. */
export const MENTION_NODE = 'mention';

/** Blocos que viram quebra de linha no texto puro. */
const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock']);

/**
 * Texto puro de um documento do Tiptap, para `content_text` (busca e limites do banco).
 * Menções entram pelo rótulo; blocos são separados por quebra de linha.
 */
export function richTextToPlain(doc: RichTextDoc | null): string {
  if (!doc) return '';
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  const walk = (node: RichTextNode) => {
    if (node.type === 'text') {
      line += node.text ?? '';
      return;
    }
    if (node.type === MENTION_NODE) {
      const label = node.attrs?.['label'];
      line += typeof label === 'string' ? label : '';
      return;
    }
    if (node.type === 'hardBreak') {
      line += ' ';
      return;
    }
    const block = node.type !== undefined && BLOCKS.has(node.type);
    if (block) flush();
    for (const child of node.content ?? []) walk(child);
    if (block) flush();
  };
  walk(doc);
  flush();
  return lines.join('\n');
}

/** Ids das entidades citadas no texto, sem repetição, na ordem em que aparecem. */
export function mentionedEntityIds(doc: RichTextDoc | null): Uuid[] {
  const ids = new Set<Uuid>();
  const walk = (node: RichTextNode) => {
    if (node.type === MENTION_NODE) {
      const id = node.attrs?.['id'];
      if (typeof id === 'string' && id) ids.add(id);
    }
    for (const child of node.content ?? []) walk(child);
  };
  if (doc) walk(doc);
  return [...ids];
}

/** Documento sem nenhum texto (só parágrafos vazios): grava-se `null`. */
export function isEmptyRichText(doc: RichTextDoc | null): boolean {
  if (!doc) return true;
  return richTextToPlain(doc) === '' && mentionedEntityIds(doc).length === 0;
}
