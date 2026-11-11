# ADR-0003 — Skiper UI e Magic UI como fontes de componentes animados, portados para Angular

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
O app quer animações marcantes (capa do livro, virada de página, brilhos dourados, partículas). As fontes escolhidas são dois catálogos gratuitos, **Magic UI** e **Skiper UI**, ambos feitos em **React** com Tailwind e Motion/framer-motion (alguns da Skiper UI usam GSAP), distribuídos por copiar e colar. Não há versões para Angular.

Licenças:
- **Magic UI**: MIT. Exige manter o aviso de copyright.
- **Skiper UI**: componentes gratuitos liberados para uso pessoal e comercial, **com atribuição**. A própria Skiper UI informa que muitos componentes são recriações de trabalhos de terceiros.

## Decisão
1. **Portar manualmente** para Angular só o necessário: 5 componentes no MVP (`docs/05`), o resto sob demanda, em `src/app/shared/motion/`.
2. Implementação standalone, `OnPush`, com signals. Animação com CSS, Web Animations API ou **`motion`** vanilla; GSAP só se o original depender dele.
3. **Não incluir React** no bundle.
4. Usar **apenas componentes gratuitos**.
5. **Atribuição**: cabeçalho de cada arquivo portado (catálogo, nome/número, URL, licença) e `THIRD_PARTY_NOTICES.md` na raiz do repositório. Não há página de créditos no app.
6. Antes de portar um componente da Skiper UI, verificar se ele recria outro trabalho e, se sim, conferir a licença original.

## Consequências
- Estética desejada sem duas árvores de renderização.
- Controle sobre acessibilidade, movimento reduzido e desempenho.
- Cada componente portado é código nosso, sem atualizações automáticas dos catálogos.

## Alternativas consideradas
- Embutir React via web components: bundle maior e complexidade.
- Só animações próprias: possível, mas mais lento.
