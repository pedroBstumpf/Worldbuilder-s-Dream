# 11 — Guia do administrador (passo a passo)

Este guia é para a pessoa que **administra** o Worldbuilder's Dream: quem cria as contas, guarda as senhas, convida pessoas e cuida dos backups. Não precisa saber programar para seguir a maior parte dele. As partes técnicas (marcadas com 🔧) normalmente são feitas junto com quem desenvolve.

## 0. Visão geral: o que fazer e quando

| # | Tarefa | Quando | Tempo |
|---|--------|--------|-------|
| 1 | Configurar o gerenciador de senhas (Bitwarden) | **Agora** | 20 min |
| 2 | Proteger a conta Google (2FA/passkey + códigos de recuperação) | **Agora** | 10 min |
| 3 | Criar conta no GitHub (repositório privado) | Início do front (Fase 1) | 10 min |
| 4 | Criar conta no Cloudflare (hospedagem do app) | Antes do lançamento (Fase 2) | 10 min |
| 5 | Registrar o domínio | Antes do back-end (Fase 2) | 15 min + propagação |
| 6 | Criar o projeto no Supabase | Início do back-end (Fase 2) | 15 min |
| 7 | Configurar o Google Cloud (login, Docs, Drive, Picker) | Início do back-end (Fase 2) | 40 min |
| 8 | Configurar o Resend (e-mail dos convites) | Fase 3 | 20 min + propagação do DNS |
| 9 | 🔧 Configurar o backup (rclone + GitHub Actions) | **Antes de guardar dados reais** | 40 min |
| 10 | Rotinas mensais, trimestrais e anuais | Depois de lançar | — |

> **Quem é dono das contas?** Se o app está sendo feito para um cliente, o ideal é que **o cliente seja o dono** do domínio, do Supabase, do Google Cloud, do Resend e do GitHub, e adicione quem desenvolve como colaborador. Assim o cliente nunca fica refém de uma conta pessoal de outra pessoa. O e-mail do **administrador do app** (seção 11) também deve ser o de quem vai usar e convidar pessoas.

---

## 1. Gerenciador de senhas (Bitwarden)

**Por que:** o app depende de várias senhas e chaves. A mais crítica é a senha que criptografa os backups: **sem ela, os backups não podem ser abertos**. Ela não pode ficar só na memória, nem num arquivo solto, nem no gerenciador de senhas do Google (a conta Google já é a chave do app e da pasta de backups; perder essa conta não pode significar perder tudo).

**Plano:** o gratuito basta (senhas e dispositivos ilimitados). O Premium (US$ 19,80/ano) não é necessário.

### 1.1 Criar a conta
1. Acesse **bitwarden.com** e crie uma conta (pode escolher guardar os dados nos EUA ou na Europa; os dois servem).
2. Escolha a **senha mestra**: uma frase com **6 palavras aleatórias sem relação entre si**, separadas por hífen. Exemplo de formato (não use este): `lanterna-caju-orbita-telhado-mangue-vigia`.
   - Não use frases conhecidas, nomes ou datas.
   - **O Bitwarden não consegue recuperar essa senha.** Se esquecê-la, perde tudo o que está lá.
3. **Escreva a senha mestra num papel** e guarde num lugar físico seguro (não fotografe).

### 1.2 Ativar a verificação em duas etapas
1. No cofre web: **Configurações › Segurança › Login em duas etapas**.
2. Escolha **App autenticador** e escaneie o QR code com um app (Google Authenticator, Microsoft Authenticator, Aegis ou 2FAS).
3. Anote o **código de recuperação** do Bitwarden **no mesmo papel** da senha mestra.

### 1.3 Instalar
- **Extensão no navegador** (Chrome, Edge, Firefox ou Safari).
- **App no celular** (pode ativar desbloqueio por biometria).

### 1.4 Organizar
Crie a pasta **"Worldbuilder's Dream"**. Tudo deste guia vai para lá.

### 1.5 Como guardar cada tipo de item
| Tipo de item no Bitwarden | Use para |
|---------------------------|----------|
| **Login** | Contas com usuário e senha (Supabase, Cloudflare, Resend, registro do domínio) |
| **Nota segura** | Chaves de API, códigos de recuperação, configurações (texto) |
| **Campos personalizados ocultos** (dentro de qualquer item) | Valores secretos que precisam de nome (ex.: `password`, `password2`) |

Anexar arquivos é recurso pago: quando precisar guardar um arquivo de configuração, cole o **conteúdo** numa nota segura.

### 1.6 O que guardar (checklist)
Marque conforme for criando:

- [ ] Senha mestra e código de recuperação do Bitwarden → **só no papel**
- [ ] Códigos de recuperação da conta Google (seção 2)
- [ ] GitHub: senha + códigos de recuperação do 2FA
- [ ] Cloudflare: senha
- [ ] Registro do domínio: senha
- [ ] Supabase: senha da conta + **senha do banco de dados** + string de conexão do *Session pooler*
- [ ] Google Cloud: *Client ID*, *Client secret*, chave de API do Picker, número do projeto
- [ ] Resend: chave de API
- [ ] **"WBD — Criptografia dos backups"**: `password` e `password2` do rclone (seção 9) — **o item mais importante**
- [ ] Chaves S3 do Storage do Supabase (seção 9)
- [ ] Conteúdo do `rclone.conf` (seção 9)

### 1.7 Regras de uso
- Nunca cole senhas ou chaves em chats, e-mails, documentos ou no código.
- Para enviar um segredo a alguém (ex.: a quem desenvolve), use o **Send** do Bitwarden: ele cria um link criptografado que expira.
- Ao gerar qualquer senha nova, crie-a **pelo gerador do Bitwarden** e salve na hora, antes de usá-la no serviço.

---

## 2. Proteger a conta Google
A conta Google é a única forma de entrar no app, guarda os textos (Docs) e a pasta de backups.

1. Acesse **myaccount.google.com › Segurança**.
2. Ative a **Verificação em duas etapas**. Se puder, adicione uma **chave de acesso (passkey)** no celular.
3. Gere os **códigos alternativos** (códigos de backup) e salve numa nota segura no Bitwarden ("Google — códigos de recuperação").
4. Confira o **e-mail e o telefone de recuperação**.
5. Peça o mesmo a cada pessoa que você convidar para o app.

---

## 3. GitHub, Git e editor (código e automações)
1. Crie a conta em **github.com** (ou use a sua) e ative o **2FA** (salve os códigos de recuperação no Bitwarden).
2. Instale o **Git** no sistema (no Windows, *Git for Windows* em git-scm.com). O GitHub Desktop tem um Git interno, mas ele não fica disponível no terminal que o Claude Code usa.
3. Instale o **GitHub Desktop**, entre com a conta GitHub e crie o repositório **privado** `worldbuilders-dream` (*File › New repository*, depois *Publish repository* com "Keep this code private" marcado).
4. Abra a pasta no **Cursor** e instale a extensão **Claude Code** (Extensions → "Claude Code", da Anthropic). Entre com a sua conta Claude (plano Pro ou superior). O uso da extensão conta no **seu plano Claude**, não no plano do Cursor.
5. No GitHub, configure o repositório conforme [`docs/12` › Configuração do GitHub](12-git-e-branches.md#configuração-do-github-uma-vez): só *Rebase and merge*, apagar branches após o merge e regras de proteção do `main`.
6. Em *Settings › Code security*, ative o **Secret scanning** e o **Push protection**, se estiverem disponíveis para o repositório.
7. Se houver quem desenvolva: *Settings › Collaborators* → convide a pessoa.

## 4. Cloudflare (hospedagem)
1. Crie a conta em **cloudflare.com** e ative o 2FA.
2. A pessoa desenvolvedora conecta o repositório ao **Cloudflare Pages** (tarefa F2-07). Antes disso não há versão publicada: as prévias do app são vídeos de tela.

## 5. Domínio
1. Registre o domínio (ex.: no **registro.br** para `.com.br`, ou no próprio Cloudflare Registrar para `.com`). Guarde a senha no Bitwarden.
2. Aponte os **servidores DNS** para o Cloudflare (o Cloudflare mostra quais são ao adicionar o site). A propagação pode levar algumas horas.
3. O domínio será usado para o endereço do app e para enviar os e-mails de convite.

## 6. Supabase (banco, login, arquivos)
1. Crie a conta em **supabase.com** (de preferência com a mesma conta GitHub) e ative o 2FA.
2. Crie o projeto **`wbdream`**, região **South America (São Paulo)**, plano **Free**.
3. Na tela de criação, **gere a senha do banco pelo Bitwarden**, cole e salve antes de continuar.
4. 🔧 Em *Connect*, copie a string do **Session pooler** e salve no Bitwarden (o backup usa essa).
5. 🔧 Em *Authentication › Providers*: deixe **só o Google** habilitado (configurado na seção 7).
6. 🔧 Em *Authentication › Hooks*: registre o hook **Before User Created** (`private.hook_before_user_created`), depois que a migração existir.
7. Se houver quem desenvolva: *Organization › Team* → convide a pessoa.
8. 🔧 Projeto de desenvolvimento: na mesma organização, crie o projeto **`wbdream-dev`** (mesma região, plano Free, senha também no Bitwarden). Ele não guarda dados reais e serve para desenvolver e testar o banco sem Docker ([ADR-0014](adr/0014-desenvolvimento-sem-docker-com-projeto-na-nuvem.md)).

## 7. Google Cloud (login com Google, Docs, Drive, Picker)
1. Acesse **console.cloud.google.com** e crie o projeto **`wbdream`**.
2. *APIs e serviços › Biblioteca*: ative **Google Drive API**, **Google Docs API** e **Google Picker API**.
3. *Tela de consentimento OAuth* (ou *Google Auth Platform*):
   - Tipo de usuário: **Externo**.
   - Nome do app: **Worldbuilder's Dream**; e-mail de suporte: o seu.
   - **Sem logotipo** (logotipo pode exigir verificação de marca).
   - Escopos: `openid`, `email`, `profile` e `https://www.googleapis.com/auth/drive.file`.
   - **Publique o app** ("Em produção"). No modo *Teste*, o acesso aos Docs expira a cada 7 dias. Confira se o console pede alguma verificação; com só esses escopos, não deveria pedir verificação de escopos.
4. *Credenciais › Criar credenciais › ID do cliente OAuth* (Aplicativo da Web):
   - Origens autorizadas: `http://localhost:4200` e `https://<seu-domínio>`.
   - URI de redirecionamento: `https://<id-do-projeto>.supabase.co/auth/v1/callback`.
   - Salve **Client ID** e **Client secret** no Bitwarden.
5. *Credenciais › Criar chave de API* (para o Picker):
   - Restrinja a **Referenciadores HTTP**: `http://localhost:4200/*` e `https://<seu-domínio>/*`.
   - Restrinja à **Google Picker API**.
   - Salve no Bitwarden, junto com o **número do projeto** (aparece no painel inicial).
6. 🔧 No Supabase, em *Authentication › Providers › Google*: cole o Client ID e o Client secret.

## 8. Resend (e-mails de convite)
1. Crie a conta em **resend.com** e ative o 2FA.
2. *Domains › Add domain*: use um subdomínio, como `mail.<seu-domínio>`.
3. O Resend mostra registros DNS (SPF, DKIM e, recomendado, DMARC). Adicione cada um no Cloudflare, em *DNS*, exatamente como aparecem. Aguarde ficar **Verified**.
4. *API Keys › Create*: permissão **Sending access**, limitada ao domínio. Salve no Bitwarden (ela só aparece uma vez).
5. 🔧 No Supabase, em *Edge Functions › Secrets*: `RESEND_API_KEY`, `INVITE_FROM` (`Worldbuilder's Dream <convites@mail.seu-domínio>`) e `APP_URL`.

Enquanto o domínio não estiver pronto, use **Copiar link do convite** no app e envie o link por mensagem.

## 9. 🔧 Backup (rclone + GitHub Actions)
Faça **antes de guardar dados reais** no app. Detalhes técnicos em [`docs/09`](09-seguranca-e-operacao.md#backups).

### 9.1 Gerar as senhas da criptografia
1. No Bitwarden, abra o **Gerador**: senha com **40 caracteres, só letras e números**.
2. Crie a nota segura **"WBD — Criptografia dos backups"** com dois **campos ocultos**:
   - `password` → primeira senha gerada;
   - `password2` → gere outra e cole aqui.
3. Escreva na nota: *"Usadas no rclone crypt (remote `cofre`). Sem elas, os backups não abrem. Restauração: docs/09."*

### 9.2 Configurar o rclone (no computador, uma vez)
Instale o rclone (rclone.org) e rode `rclone config`:

1. **Remote `gdrive`** (Google Drive):
   - `n` (novo) → nome `gdrive` → tipo `drive`;
   - *client_id/client_secret*: pode usar os do projeto Google (recomendado) ou deixar em branco;
   - *scope*: escolha **`drive.file`**;
   - aceite abrir o navegador e autorize com a sua conta Google.
2. **Remote `cofre`** (criptografia):
   - `n` → nome `cofre` → tipo `crypt`;
   - *remote*: `gdrive:Worldbuilders Dream Backups`;
   - criptografia de nomes de arquivos: `standard`; de pastas: `true`;
   - senha: **"type in my own password"** → cole `password` do Bitwarden;
   - *salt*: **"type in my own"** → cole `password2`.
3. **Remote `supabase-s3`** (arquivos do Storage):
   - no Supabase: *Storage › Settings › S3 Connection* → gere chaves de acesso e salve no Bitwarden;
   - `n` → nome `supabase-s3` → tipo `s3` → provider `Other`;
   - *access key* e *secret*: os gerados;
   - *endpoint*: o mostrado na tela S3 do Supabase; *region*: `sa-east-1`.
4. Teste: `rclone mkdir cofre:diarios` e `rclone ls cofre:`.
5. Rode `rclone config file`, abra o arquivo indicado e copie todo o conteúdo para:
   - uma nota segura no Bitwarden ("WBD — rclone.conf");
   - o secret `RCLONE_CONFIG` do GitHub (abaixo).

### 9.3 Secrets do GitHub
No repositório: *Settings › Secrets and variables › Actions › New repository secret*:
- `SUPABASE_DB_URL` → string do Session pooler (com a senha do banco);
- `RCLONE_CONFIG` → conteúdo do `rclone.conf`.

### 9.4 Conferir
1. Em *Actions › backup › Run workflow*, rode à mão.
2. No Google Drive, confira a pasta **Worldbuilders Dream Backups**: os nomes aparecem embaralhados (é a criptografia funcionando).
3. Teste abrir: `rclone ls cofre:diarios` deve listar `db-AAAA-MM-DD.tgz` com o nome legível.

---

## 10. Primeiro acesso
1. A primeira migração do banco inclui **o seu e-mail** como único autorizado e como administrador (`private.allowed_emails` e `private.app_admins`).
2. Abra o app → capa → **Entrar com Google** com esse e-mail → o livro abre na biblioteca vazia.
3. Em **Configurações › Google**, confira que aparece "Google conectado".

## 11. Convidar e remover pessoas
**Convidar**
1. **Configurações › Pessoas › Convidar**.
2. Digite o e-mail (precisa ser uma conta Google ou um e-mail ligado a uma conta Google).
3. Opcional: escolha os mundos que a pessoa poderá editar.
4. **Enviar convite**. Se o e-mail não chegar, use **Copiar link do convite** e mande por mensagem.
5. A pessoa abre o link, clica **Aceitar e entrar com Google** e entra **com a conta daquele e-mail**. O convite vale 7 dias e só pode ser usado uma vez.

**Gerenciar**
- **Reenviar**: gera um link novo (o anterior para de funcionar).
- **Cancelar convite**: o link deixa de valer.
- **Revogar acesso**: a pessoa perde o acesso ao app e aos mundos; a sessão atual dela expira em até 1 hora.
- Para dar acesso a mais um mundo a quem já tem conta: no mundo, **⋯ › Membros › Adicionar**.

**Docs compartilhados**: para outra pessoa ler um Google Doc vinculado, ele precisa estar compartilhado com ela no Google Drive, e ela precisa clicar em **Conceder acesso a este Doc** uma vez no app.

## 12. Rotinas
**Todo mês (5 min)**
- [ ] No Google Drive, confirme que há backup de ontem em `Worldbuilders Dream Backups`.
- [ ] No Supabase, *Reports*/uso: banco e Storage longe dos limites gratuitos (≈ 500 MB e 1 GB).
- [ ] Veja se chegou algum e-mail do GitHub sobre falha do backup.

**A cada trimestre (30–60 min, 🔧)**
- [ ] **Teste de restauração** no ambiente local, usando as senhas do Bitwarden ([`docs/09`](09-seguranca-e-operacao.md#restauração-runbook)). Isso também prova que as senhas guardadas estão certas.
- [ ] Revise quem tem acesso em **Configurações › Pessoas**.

**Uma vez por ano**
- [ ] Gere novas chaves S3 do Storage e nova chave do Resend; atualize Bitwarden, GitHub e Supabase; apague as antigas.
- [ ] 🔧 Atualização anual do Angular.

## 13. Emergências
| Situação | O que fazer |
|----------|-------------|
| **Perdi o celular** do 2FA | Use os códigos de recuperação (Google, GitHub, Bitwarden) guardados no papel/Bitwarden; depois configure o 2FA no celular novo |
| **Esqueci a senha mestra do Bitwarden** | Não há recuperação. Por isso ela fica no papel. Se o papel também se perdeu, crie um cofre novo e regenere todas as chaves dos serviços (as senhas dos backups antigos estarão perdidas: faça um backup novo imediatamente) |
| **E-mail de falha do backup** | Abra *Actions › backup* no GitHub, veja o erro e rode de novo à mão; se persistir, chame quem desenvolve |
| **App diz "servidor em pausa"** | Supabase → projeto → **Resume project**; depois verifique por que o backup diário parou |
| **Suspeita de invasão** | 1) Troque a senha da conta Google e encerre sessões em myaccount.google.com; 2) revogue acessos suspeitos no app; 3) 🔧 gere nova chave `service_role` e novo Client secret do Google, atualizando os secrets; 4) confira os dados contra o último backup |
| **Alguém apagou algo por engano** | Primeiro olhe a **Lixeira** do mundo; se já foi esvaziada, 🔧 restaure a partir do backup |
