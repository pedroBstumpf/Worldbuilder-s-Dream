# ADR-0005 — Supabase (plano gratuito) como back-end, com backup diário externo

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
App pessoal (um administrador e poucos convidados), sem pagamento. Critérios: custo zero, nenhuma manutenção, não perder dados, integração com Google e simplicidade. Foram avaliados Supabase, Firebase, "só Google Drive" (local-first) e Supabase + Firebase juntos.

Fatos (verificados em 11/11/2026):
- **Supabase gratuito**: ≈ 500 MB de banco e 1 GB de arquivos; Edge Functions incluídas; **pausa após 7 dias** de pouca atividade no banco (retomável pelo painel por até 1 ano, sem perda de dados); **sem backups automáticos**. Pro: US$ 25/mês.
- **Firebase**: Firestore e Auth gratuitos sem pausa, cache offline nativo; mas **Cloud Storage e Cloud Functions exigem o plano Blaze** (cartão de crédito), e o modelo de documentos exige desnormalizar dados relacionais.

## Decisão
Usar o **Supabase no plano gratuito**, sem servidor próprio:
- Postgres + RLS como camada de autorização; PostgREST e RPCs para dados; Edge Functions para segredos e processamento; Storage privado; Vault para tokens do Google.
- **Backup diário automatizado** por GitHub Actions (repositório privado): dump do banco e cópia semanal do Storage, criptografados com rclone e guardados no Google Drive do dono. O mesmo job gera atividade diária e evita a pausa (`docs/09`).
- **Portas de repositório** no `domain/` com implementação Supabase em `data-access/`, para que uma troca futura fique restrita a essa camada.

## Consequências
- US$ 0, sem cartão; modelo relacional adequado a entidades ↔ eventos ↔ tokens ↔ keyframes e a consultas por intervalo de tempo.
- Segurança concentrada no banco: RLS em tudo, testes pgTAP e revisão de funções `security definer`.
- Dependência de um job externo: se ele parar, o projeto pode pausar (sem perda de dados) e os backups param. O GitHub avisa falhas por e-mail.
- Leitura offline precisa ser implementada (cache IndexedDB, Fase 5; reaproveita o adaptador local da Fase 1).
- Subir para o Pro (sem pausa, backups diários gerenciados) não exige migração.

## Alternativas consideradas
- **Firebase**: melhor para edição offline e sem pausa, mas exige Blaze (cartão) para imagens e para a função do token do Google, e um modelo de dados reescrito como documentos.
- **Só Google Drive (local-first)**: custo e infraestrutura zero, mas sincronização complexa no cliente e conflitos entre usuários.
- **Supabase + Firebase juntos**: dois modelos de segurança e duas fontes de dados que divergem.
- **Servidor próprio (NestJS)**: mais custo e manutenção sem ganho para este escopo.
