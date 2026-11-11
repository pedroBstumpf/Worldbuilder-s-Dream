# 09 — Segurança e operação

Escopo: app pessoal (um administrador e poucos convidados), exposto na internet, sem cadastro público. A referência é o OWASP ASVS nível 2, aplicado só ao que existe neste app.

## Modelo de ameaças
| Ameaça | Exemplo | Mitigação |
|--------|---------|-----------|
| Acesso por estranhos | Alguém encontra a URL do app ou do Supabase | **Login só com Google + lista fechada de e-mails** (hook do Supabase); RLS em todas as tabelas |
| Convite interceptado ou reaproveitado | Link do convite encaminhado ou vazado | Token de 32 bytes no fragmento da URL, guardado só como hash, uso único, validade de 7 dias; aceitar exige entrar com a conta Google **do e-mail convidado** |
| Abuso do envio de convites | Disparo em massa a partir do app | Só administrador envia; limite de 10 por dia; domínio com SPF, DKIM e DMARC |
| Conta Google comprometida | Senha da conta Google vazada | **Verificação em duas etapas ou passkey** obrigatória nas contas de todos os usuários |
| Alteração de dados de outro mundo | Mudar `world_id` numa requisição | RLS + trigger de consistência de `world_id` |
| Leitura de arquivos | URL de imagem vazada | Bucket privado + URLs assinadas de 1 h |
| Roubo de token do Google | XSS ou log | Refresh token só no Vault; access token só em memória; CSP estrita; nada de tokens em logs |
| XSS | Texto rico malicioso, nome de entidade com `<script>`, conteúdo de Doc | Angular escapa por padrão; textos como JSON (Tiptap/Docs); proibição de `innerHTML`; CSP |
| Escalada de privilégio | Editor tenta virar dono | Membros só via RPC com checagem de `owner`; `security definer` com `search_path = ''` |
| Perda de dados | Exclusão acidental, falha do provedor, projeto pausado | Lixeira (soft delete), versão por linha, **backup diário criptografado fora do Supabase** |
| Abuso de recursos | Upload enorme | Limites do bucket, validação no cliente e em `process-asset` |

## Autenticação
- **Único método: Google** via Supabase Auth (PKCE). Provedores de e-mail/senha, link mágico e telefone ficam **desligados**.
- **Lista de acesso**: hook *before user created* recusa e-mails fora de `private.allowed_emails` (`docs/07`). Ninguém novo consegue criar conta, nem com uma conta Google válida.
- **Convites**: só o administrador (`private.app_admins`) convida e revoga. O e-mail só entra na lista quando o convite válido é aceito.
- **Revogação**: remove da lista, bloqueia a conta (ban no Auth, que impede renovar a sessão; a sessão atual expira em até 1 h), tira a pessoa dos mundos e revoga o token do Google dela.
- **E-mail de convite**: enviado pelo Resend a partir de um domínio próprio com SPF, DKIM e DMARC; sem rastreamento de abertura ou clique.
- Segurança das contas Google: 2FA ou passkey em todos os usuários (a conta Google passa a ser a chave do app).
- Sessão Supabase: JWT de 1 h, refresh token com rotação (padrão).
- **Reautenticação** (login recente, < 10 min) para excluir conta ou excluir mundo definitivamente.
- Não são necessários: CAPTCHA, MFA própria, política de senha ou verificação de senhas vazadas.

## Autorização
- **Fonte única: RLS.** Guards do Angular são só conveniência.
- Papéis por mundo: `owner` (tudo, incluindo membros e exclusão) e `editor` (conteúdo).
- `service_role` só em Edge Functions e no CI; nunca no bundle (o CI procura a chave no `dist/`).
- Funções `security definer` revisadas com atenção: `set search_path = ''`, nomes qualificados, `revoke … from public, anon`, checagem de `auth.uid()` e do papel.
- Testes pgTAP de RLS obrigatórios para toda tabela.

## Tokens do Google
- **Refresh token**: guardado pela Edge Function `google-connect` no **Supabase Vault** (criptografado), referenciado em `private.google_credentials`; lido só por `google-token`; nunca vai ao navegador.
- **Access token**: até 1 h, só em memória no navegador (signal), descartado no logout.
- **Desconectar Google** revoga no Google e apaga do Vault.
- Escopo único `drive.file`: mesmo com um token vazado, só os arquivos que o app criou ou que o usuário escolheu ficam expostos.

## Front-end
### Content Security Policy (produção, via `_headers` do Cloudflare Pages)
```
default-src 'self';
script-src 'self' https://apis.google.com;
style-src 'self' 'nonce-{NONCE}';
img-src 'self' data: blob: https://<projeto>.supabase.co https://*.googleusercontent.com;
font-src 'self';
connect-src 'self' https://<projeto>.supabase.co https://www.googleapis.com https://docs.googleapis.com;
frame-src https://docs.google.com;
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```
- `apis.google.com` e `docs.google.com` são para o Picker. Adicionar `wss://<projeto>.supabase.co` quando o Realtime entrar (Fase 5).
- Angular com `autoCsp`/nonce para estilos inline; sem `unsafe-eval`. A CSP fica ativa nos testes e2e para pegar violações antes do deploy.

### Outros headers
```
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

### Código
- Proibido `innerHTML` (ESLint) e `bypassSecurityTrust*` sem justificativa revisada.
- Links: só `https:` e `mailto:`, com `rel="noopener noreferrer"`.
- Código copiado de Skiper UI/Magic UI é revisado como código próprio; nada é carregado de CDN.
- Dependências: Renovate (agrupado, semanal), `pnpm audit` no CI, lockfile versionado, `onlyBuiltDependencies` no pnpm.

### Dados no dispositivo
Cache de Docs e imagens fica em IndexedDB. "**Sair e limpar este dispositivo**" apaga o cache; o logout comum mantém o cache, mas nunca guarda tokens.

## Guarda de segredos (gerenciador de senhas)
Usar um **gerenciador de senhas** (recomendado: Bitwarden) com uma pasta "Worldbuilder's Dream" contendo:

| Item | Por quê |
|------|---------|
| **Senhas do rclone `crypt`** (senha e "salt") | Sem elas, os backups **não podem ser abertos**. É o item mais importante. |
| Cópia do `rclone.conf` (nota segura) | Recriar o acesso ao Drive dos backups |
| Senha do banco do Supabase | Restaurar e rodar o dump |
| Códigos de recuperação: conta Google, GitHub, Supabase | Recuperar contas se perder o celular do 2FA |
| Chaves que não dá para ver de novo depois de criadas (Resend, S3 do Storage) | Reconfigurar sem ter que gerar tudo de novo |

Passo a passo completo em [`docs/11`](11-guia-do-administrador.md). A senha mestra do gerenciador e o código de recuperação dele ficam **também em papel**, guardados num lugar físico seguro. O teste trimestral de restauração usa as senhas do gerenciador, o que confirma que elas estão certas.

## Uploads
1. Cliente valida tipo e assinatura do arquivo, reduz a 8192 px e converte para WebP (remove EXIF).
2. Bucket com `allowed_mime_types` e `file_size_limit`.
3. `process-asset` revalida no servidor e registra o tamanho.
4. Nomes de objeto gerados pelo sistema (`uuid`).
5. SVG não é aceito.

## Edge Functions
CORS só para a origem do app; JWT verificado; entrada validada com zod; erros sem stack trace; logs sem tokens nem conteúdo; `google-token` com rate limit simples por usuário.

## Privacidade
- Os dados ficam no Supabase (`sa-east-1`), no Cloudflare (só arquivos estáticos do app) e no Google Drive dos próprios usuários.
- Sem analytics nem rastreamento.
- O app oferece **exportar mundo** (JSON) e **excluir conta**.
- Seguir a *Google API Services User Data Policy* (inclusive *Limited Use*) no uso dos dados do Google.
- **LGPD**: a lei não se aplica a tratamento feito por pessoa natural para fins exclusivamente particulares e não econômicos (art. 4º, I), o que provavelmente cobre este uso pessoal. Não é aconselhamento jurídico: se o app for aberto a outras pessoas, revisar este ponto.

---

# Operação

## Backups
O plano gratuito do Supabase não tem backups automáticos. Um workflow agendado no GitHub Actions (repositório **privado**) faz o backup e, de quebra, mantém o projeto ativo. Ver [ADR-0005](adr/0005-supabase-gratuito-com-backup-diario.md).

| O quê | Frequência | Destino | Retenção |
|-------|-----------|---------|----------|
| Banco (papéis, schema e dados) | **diário** | pasta "Worldbuilder's Dream — Backups" no Google Drive, **criptografada** pelo rclone (`crypt`) | 35 dias diários + 1 por mês para sempre |
| Arquivos do Storage (mapas, retratos) | **semanal** (incremental) | mesma pasta, subpasta `storage/` | espelho atual + versões antigas por 35 dias |

```yaml
# .github/workflows/backup.yml (esboço)
name: backup
on:
  schedule:
    - cron: '17 6 * * *'        # todo dia, 03:17 em Brasília
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: supabase/setup-cli@v1
      - name: Dump do banco
        env:
          DB_URL: ${{ secrets.SUPABASE_DB_URL }}   # Session pooler (IPv4)
        run: |
          supabase db dump --db-url "$DB_URL" --role-only -f roles.sql
          supabase db dump --db-url "$DB_URL" -f schema.sql
          supabase db dump --db-url "$DB_URL" --data-only --use-copy -f data.sql
          tar czf "db-$(date +%F).tgz" roles.sql schema.sql data.sql
      - name: Enviar ao Drive (criptografado)
        env:
          RCLONE_CONFIG_DATA: ${{ secrets.RCLONE_CONFIG }}  # remotes: gdrive (drive.file) + cofre (crypt)
        run: |
          curl -fsS https://rclone.org/install.sh | sudo bash
          mkdir -p ~/.config/rclone && printf '%s' "$RCLONE_CONFIG_DATA" > ~/.config/rclone/rclone.conf
          rclone copy db-*.tgz cofre:diarios/
          [ "$(date +%d)" = "01" ] && rclone copy db-*.tgz cofre:mensais/ || true
          rclone delete cofre:diarios --min-age 35d
      - name: Arquivos do Storage (aos domingos ou quando disparado à mão)
        run: |
          [ "$(date +%u)" = "7" ] || [ "${{ github.event_name }}" = "workflow_dispatch" ] || exit 0
          rclone sync supabase-s3:world-assets cofre:storage/ \
            --backup-dir "cofre:storage-antigo/$(date +%F)"
          rclone delete cofre:storage-antigo --min-age 35d
```
- O Storage do Supabase é lido pela interface compatível com S3 (chaves de acesso S3 geradas no painel, guardadas dentro do `RCLONE_CONFIG`).
- Usar a string de conexão do **Session pooler**: a conexão direta do banco no plano gratuito é só IPv6, e os runners do GitHub usam IPv4.
- A chave do `crypt` do rclone fica também num **gerenciador de senhas** do dono: sem ela, os backups não podem ser abertos.
- O GitHub avisa por e-mail quando um workflow agendado falha.

## Restauração (runbook)
1. Baixar e abrir o backup: `rclone copy cofre:diarios/db-AAAA-MM-DD.tgz . && tar xzf db-*.tgz`.
2. Restaurar no projeto (o mesmo, após reset, ou um novo):
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "$DB_URL"
   ```
3. Arquivos: `rclone sync cofre:storage/ supabase-s3:world-assets`.
4. Reconfigurar segredos das Edge Functions e o hook de autenticação.
5. Os refresh tokens do Google guardados no Vault não valem num projeto novo: os usuários fazem "Reconectar Google".
6. **Teste de restauração a cada trimestre** no Supabase local (`supabase start` + passos acima), conferindo que mundos, usuários (`auth.users`) e metadados do Storage voltaram. O primeiro teste confirma se os dumps incluem tudo; ajustar os parâmetros do `db dump` se não incluírem.

## Pausa do projeto
- O job diário gera atividade no banco, o que evita a pausa por inatividade (7 dias no plano gratuito).
- Se o job parar e o projeto pausar, os dados **não** se perdem: o app mostra "O servidor está em pausa" e o dono reativa em *Dashboard → projeto → Resume project*.
- Se um dia a pausa ou os limites incomodarem, subir para o plano Pro não exige migração.

## Monitoramento leve
- E-mail do GitHub em falha do backup ou do CI.
- Uma vez por mês: painel de uso do Supabase (banco e Storage) e *advisors* de segurança e desempenho.
- Erros do front: console no desenvolvimento; Sentry (gratuito) só se houver erros difíceis de reproduzir.

## Manutenção
- Angular: majors anuais; reservar um dia por ano para `ng update`.
- Dependências: PRs semanais do Renovate, mesclados quando o CI passar.
- Rotacionar a chave S3 do Storage e o token do rclone a cada ano.

## Checklist de release
- [ ] CI verde (lint, testes, pgTAP, e2e com CSP ativa).
- [ ] *Advisors* do Supabase sem alertas de segurança.
- [ ] Nenhum segredo no bundle.
- [ ] Funções `security definer` novas revisadas.
- [ ] Teste manual com conta Google real: login, Doc vinculado, Picker.
- [ ] Último backup diário com sucesso.
