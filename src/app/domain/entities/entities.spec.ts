import type { RichTextDoc } from '../models/rich-text';
import { ALIAS_MAX_LENGTH, normalizeLabels, splitLabels } from './aliases';
import { isEmptyRichText, mentionedEntityIds, richTextToPlain } from './rich-text';

const doc: RichTextDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Origem' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Filha de ' },
        { type: 'mention', attrs: { id: 'e1', label: 'Bruno' } },
        { type: 'text', text: ' e ' },
        { type: 'mention', attrs: { id: 'e2', label: 'Clara' } },
        { type: 'hardBreak' },
        { type: 'text', text: 'neta de ' },
        { type: 'mention', attrs: { id: 'e1', label: 'Bruno' } },
      ],
    },
    { type: 'paragraph' },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
        },
      ],
    },
  ],
};

describe('rich text', () => {
  it('derives plain text with one line per block and mention labels', () => {
    expect(richTextToPlain(doc)).toBe('Origem\nFilha de Bruno e Clara neta de Bruno\na');
    expect(richTextToPlain(null)).toBe('');
  });

  it('lists mentioned entities once, in order', () => {
    expect(mentionedEntityIds(doc)).toEqual(['e1', 'e2']);
    expect(mentionedEntityIds(null)).toEqual([]);
  });

  it('treats a document with only empty paragraphs as empty', () => {
    expect(isEmptyRichText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyRichText(doc)).toBe(false);
  });
});

describe('labels (aliases and tags)', () => {
  it('trims, drops empties and duplicates ignoring accents and case', () => {
    expect(normalizeLabels(['  Rosa  Negra ', '', 'rosa negra', 'Lâmina', 'lamina'])).toEqual([
      'Rosa Negra',
      'Lâmina',
    ]);
  });

  it('excludes the entity name and caps the length', () => {
    expect(normalizeLabels(['Aria', 'ária', 'x'.repeat(100)], 'Aria')).toEqual([
      'x'.repeat(ALIAS_MAX_LENGTH),
    ]);
  });

  it('splits typed text by commas and semicolons', () => {
    expect(splitLabels('a, b;c')).toEqual(['a', ' b', 'c']);
  });
});
