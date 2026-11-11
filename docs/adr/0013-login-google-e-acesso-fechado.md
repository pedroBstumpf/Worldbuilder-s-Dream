# ADR-0013 — Login só com Google e acesso fechado por convite

- **Status**: Aceito
- **Data**: 2026-11-11

## Contexto
O app é pessoal: começa com **um único usuário, o administrador**, que quer poder **convidar outras pessoas por e-mail**. Ele fica exposto na internet, e a URL e a chave publicável do Supabase são visíveis no navegador, então cadastro aberto seria o maior risco. O Google já é necessário para os Docs ([ADR-0008](0008-google-docs-como-fonte-do-texto.md)).

## Decisão
- **Único método de login: Google** (Supabase Auth, PKCE). E-mail/senha, link mágico e telefone ficam desligados.
- **Lista de acesso** em `private.allowed_emails`, imposta pelo hook **Before User Created**: nenhuma conta é criada para e-mails fora da lista.
- **Administrador** em `private.app_admins`. A migração inicial contém **só o e-mail do administrador** nas duas tabelas.
- **Convite por e-mail** (Edge Functions `send-invite`, `check-invite`, `accept-invite`):
  - token aleatório de 32 bytes no fragmento da URL, guardado só como hash, uso único, validade de 7 dias;
  - o e-mail entra na lista **apenas quando o convite válido é aceito**;
  - o convidado precisa entrar com a conta Google **do e-mail convidado** (`login_hint` ajuda a escolher a conta certa);
  - o convite pode incluir mundos, liberados como editor no primeiro login;
  - e-mails enviados pelo **Resend** a partir de um domínio próprio verificado (o e-mail padrão do Supabase só entrega para membros da equipe do projeto, 2 por hora). "Copiar link do convite" serve de alternativa.
- **Revogação** (`revoke-access`): remove da lista, bloqueia a conta no Auth, tira dos mundos e revoga o token do Google.
- Papéis por mundo continuam `owner` e `editor`; quem já tem acesso pode ser adicionado a um mundo pelo dono (`add_world_member`).
- Recomendação operacional: 2FA ou passkey nas contas Google de todos os usuários.

## Consequências
- Não há fluxos de senha, recuperação, CAPTCHA nem MFA própria.
- O convite exige posse do link **e** da conta Google do e-mail: um link encaminhado não dá acesso a outra pessoa.
- Passa a existir um serviço externo de e-mail (Resend, gratuito para este volume) e a necessidade de um domínio com SPF, DKIM e DMARC.
- O hook só age na criação da conta; por isso a revogação precisa também bloquear a conta.

## Alternativas consideradas
- `inviteUserByEmail` do Supabase: envia link de login por e-mail (link mágico), que exigiria ligar o provedor de e-mail e dependeria do SMTP; o fluxo próprio mantém o Google como único login.
- Adicionar e-mails à mão por migração: funciona, mas não atende ao pedido de convidar pelo app.
- E-mail e senha além do Google: mais telas e mais superfície de ataque sem benefício.
