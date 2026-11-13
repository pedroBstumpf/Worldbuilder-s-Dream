-- Estrutura e privilégios: RLS em todas as tabelas, nada para anon, nada de TRUNCATE.
select plan(9);

select tables_are('public', array[
  'profiles', 'worlds', 'world_members', 'calendars', 'assets', 'maps', 'map_links',
  'map_image_versions', 'entities', 'entity_relations', 'entity_mentions', 'events',
  'event_participants', 'map_tokens', 'token_keyframes', 'map_annotations', 'external_links'
], 'o schema public tem as tabelas do docs/07');

select is_empty($$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
$$, 'toda tabela do public tem RLS habilitado');

select is_empty($$
  select table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
$$, 'anon não tem privilégio em nenhuma tabela');

select is_empty($$
  select table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
$$, 'authenticated não tem TRUNCATE, REFERENCES nem TRIGGER');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
$$, 'anon não executa nenhuma função security definer');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'toda função security definer fixa search_path vazio');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.prosecdef
$$, 'funções de trigger security definer não são executáveis por authenticated');

select trigger_is('auth', 'users', 'handle_new_user', 'public', 'handle_new_user',
  'auth.users cria o perfil');

select has_extension('extensions', 'unaccent', 'unaccent instalado no schema extensions');

select * from finish();
