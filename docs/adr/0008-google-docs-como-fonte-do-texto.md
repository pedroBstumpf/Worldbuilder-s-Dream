# ADR-0008 — Google Docs como fonte do texto, renderizado pela Docs API, com token no servidor

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
O usuário quer usar **os seus próprios Google Docs como o texto visível e utilizável dentro do site**, e não só como anexos. Com os Docs no centro da experiência, o acesso precisa existir em toda sessão sem pop-ups, e o conteúdo precisa ser exibido com segurança e com recursos de navegação.

## Decisão
1. Mundo, entidade e evento têm um **texto principal** nativo (Tiptap) ou um **Google Doc vinculado** (`external_links.purpose = 'primary_text'`). O mundo tem uma lista ordenada de Docs (`purpose = 'chapter'`), mostrada na aba **História**.
2. O Doc é **a fonte da verdade**. O app lê via `documents.get` (JSON estrutural), converte para Tiptap somente-leitura com um conversor puro e testado e guarda cache por `revisionId` no IndexedDB. Nenhum HTML do Google é injetado.
3. Camadas de uso que não alteram o Doc: nomes de entidades (e apelidos) como links, datas do calendário do mundo como âncoras da linha do tempo, sumário e "Aparições".
4. Edição no MVP **no Google Docs** ("Editar no Google Docs" e recarga por `revisionId` ao voltar); na Fase 5 (evolução), edições leves via `documents.batchUpdate` com `requiredRevisionId`.
5. Escopo único `drive.file`, aceito pela Drive API e pela Docs API.
6. Login com Google via Supabase pedindo acesso offline. O **refresh token** fica criptografado no **Supabase Vault** (Edge Functions `google-connect`, `google-token`, `google-disconnect`); o navegador recebe só access tokens de até 1 h.
7. App OAuth **publicado** (no modo Teste, os refresh tokens expiram em 7 dias).

## Consequências
- O texto continua do usuário, com histórico, comentários e edição no celular pelo app do Docs.
- Risco de XSS muito menor que com HTML exportado.
- Guardar refresh token exige cuidado: Vault, schema privado, revogação e logs sem tokens (`docs/09`).
- O conversor precisa acompanhar recursos do Docs; o que não for suportado aparece com aviso.
- Com mais de um usuário, cada um precisa ter o Doc compartilhado no Drive e concedê-lo ao app uma vez pelo Picker (`docs/08`).

## Alternativas consideradas
- Exportar HTML + DOMPurify: traz HTML externo e perde a estrutura usada pela navegação.
- Token só no navegador (GIS): pop-up a cada sessão, ruim quando os Docs são o texto principal.
- Editor do Docs em `iframe`: instável (cookies de terceiros, política de frames).
- Copiar o texto para o banco e editar só no app: perde a ideia de usar os próprios Docs.
