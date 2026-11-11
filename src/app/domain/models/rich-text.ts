import type { JsonObject } from './common';

/**
 * Documento do Tiptap (JSON do ProseMirror), guardado em `content jsonb` (ADR-0010).
 * Espelha o `JSONContent` do Tiptap sem depender do pacote.
 */
export interface RichTextNode {
  type?: string;
  attrs?: JsonObject;
  content?: RichTextNode[];
  marks?: { type: string; attrs?: JsonObject }[];
  text?: string;
}

export interface RichTextDoc extends RichTextNode {
  type: 'doc';
}
