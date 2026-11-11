# ADR-0012 — Identidade visual: couro, pergaminho e ouro

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
A direção provisória ("cartografia noturna", com vidro fosco e acentos âmbar) foi definida antes das referências visuais. O usuário enviou duas referências (tela do mapa estilo VTT e capa de livro em couro) e definiu a paleta: **tons de marrom** (couro), **bege claro** (papel antigo) e **dourado** para o que deve chamar atenção.

## Decisão
- Adotar o conceito **"grimório do cartógrafo"** descrito em `docs/05`, com primitivos `couro-*`, `pergaminho-*` e `ouro-*` e tokens semânticos `--wd-*`.
- Painéis **opacos de couro com filete dourado duplo**, sem vidro fosco, implementados só com CSS/Tailwind ([ADR-0002](0002-cdk-e-tailwind-sem-material.md)).
- Ouro reservado para destaque (proporção 60-30-10): slider do tempo, botão primário, seleção, ferramenta/aba ativa, eventos.
- Tipografia: Cinzel (inscrições em caixa-alta), EB Garamond (conteúdo de livro), Inter (interface densa), JetBrains Mono (medidas).
- Tema padrão escuro (couro); tema claro "pergaminho" opcional para leitura; modo de alto contraste sem texturas.
- Contrastes validados (tabela em `docs/05`). O dourado sobre pergaminho (4,2:1) só é usado em texto grande e ornamentos.

## Consequências
- Identidade forte e coerente da capa ao mapa.
- Texturas aumentam o peso visual e o de download: arquivos pequenos em mosaico, WebP/AVIF, desligáveis.
- Fontes serifadas exigem cuidado em tamanhos pequenos, por isso a interface densa usa Inter.

## Alternativas consideradas
- Manter a "cartografia noturna": descartada após as referências.
- Tema claro (pergaminho) como padrão: menos contraste com mapas coloridos e mais cansativo em sessões longas; mantido como opção.
