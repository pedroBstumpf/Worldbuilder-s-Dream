# ADR-0007 — Imagens no Storage do Supabase por padrão, Google Drive como opção

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
Mapas e retratos precisam carregar como textura WebGL com CORS e desempenho confiáveis, e os convidados precisam vê-los. Há o desejo de economizar espaço. Links externos quebram.

## Decisão
- Tabela `assets` com `source` = `storage` | `google_drive` | `external_url`.
- **Padrão: Storage do Supabase** (bucket privado, URLs assinadas), após conversão para **WebP** no cliente e redução a no máximo 8192 px. Isso reduz bastante o tamanho, e o 1 GB gratuito comporta centenas de mapas.
- **Opção: Google Drive**, escolhida em Configurações. A imagem vai para a pasta do mundo no Drive e é baixada com o token do usuário, com cache em IndexedDB.
- URL externa HTTPS aceita com aviso, com opção de copiar para o Storage.

## Consequências
- Funciona igual para todos os usuários, sem depender de acesso no Drive.
- Imagens no Storage entram no backup semanal (`docs/09`).
- Imagens no Drive economizam o Storage, mas só aparecem para quem tem acesso ao arquivo no Drive.

## Alternativas consideradas
- Drive como padrão: exige token até para ver o mapa e complica o acesso dos convidados.
- Só links externos: CORS, links quebrados, sem controle de tamanho.
