# ADR-0010 — Tiptap como editor de texto rico

- **Status**: Aceito
- **Data**: 2026-11-09

## Contexto
Fichas e eventos precisam de texto rico com menções a entidades (`@personagem`), links e imagens, armazenado de forma segura e pesquisável.

## Decisão
Usar **Tiptap** (sobre ProseMirror, núcleo agnóstico de framework) integrado via componente Angular próprio (ou `ngx-tiptap`), salvando **JSON** (`content jsonb`) e texto puro derivado (`content_text`) para busca.

## Consequências
- Esquema controlado: só nós/marcas permitidos existem, reduzindo XSS.
- Menções viram vínculos reais (`entity_mentions`), habilitando "onde esta personagem é citada".
- JSON é fácil de transformar para exportação (Markdown, HTML, EPUB).
- Biblioteca de terceiros com partes pagas (colaboração/Pro) — usar apenas o núcleo MIT.

## Alternativas consideradas
- Quill — descartado: modelo de documento menos flexível para menções customizadas.
- Markdown puro (textarea) — simples, mas UX inferior para autores.
- Lexical — focado em React.
