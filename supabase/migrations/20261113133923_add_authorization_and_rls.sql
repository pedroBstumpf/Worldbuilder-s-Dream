-- Autorização (docs/07 › Funções auxiliares e Políticas RLS).
-- Regras: membro (owner ou editor) lê o mundo e tudo que ele contém; os dois editam o conteúdo;
-- só o owner altera o mundo; ninguém escreve em world_members fora das RPCs (F2-03);
-- `anon` não acessa nada.

-- 1. Funções auxiliares (security definer: leem world_members sem passar pelo RLS dele)
create function public.world_role(p_world_id uuid)
returns public.member_role
language sql stable security definer
set search_path = ''
as $$
  select m.role from public.world_members m
  where m.world_id = p_world_id and m.user_id = (select auth.uid())
$$;

create function public.can_read_world(p_world_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select public.world_role(p_world_id) is not null $$;

create function public.can_edit_world(p_world_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce(public.world_role(p_world_id) in ('owner', 'editor'), false) $$;

-- Perfis visíveis: o próprio e os de quem divide algum mundo com o usuário atual.
create function public.shares_world_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.world_members mine
    join public.world_members theirs on theirs.world_id = mine.world_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  )
$$;

revoke execute on function
  public.world_role(uuid), public.can_read_world(uuid),
  public.can_edit_world(uuid), public.shares_world_with(uuid)
  from public, anon;
grant execute on function
  public.world_role(uuid), public.can_read_world(uuid),
  public.can_edit_world(uuid), public.shares_world_with(uuid)
  to authenticated;

-- wd_unaccent é chamada pelas colunas geradas `search` (como o usuário que grava).
revoke execute on function public.wd_unaccent(text) from public, anon;
grant execute on function public.wd_unaccent(text) to authenticated;

-- 2. Privilégios de tabela. O padrão do Supabase dá ALL (inclusive TRUNCATE, que ignora o RLS)
-- a anon e authenticated; aqui fica só o que as políticas abaixo usam.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Tabelas futuras não herdam privilégios para anon nem TRUNCATE: cada migração concede o seu.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- 3. profiles: lê o próprio e o de quem divide mundo; altera só o próprio.
-- O insert é feito pelo trigger handle_new_user; não há delete (sai junto com auth.users).
create policy "self or world mates read profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.shares_world_with(id)));
create policy "self updates profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 4. worlds: membros leem; só o owner altera (inclusive a lixeira, por deleted_at).
-- Insert só pela RPC create_world e delete só pela RPC de exclusão definitiva (F2-03).
create policy "members read worlds" on public.worlds
  for select to authenticated
  using ((select public.can_read_world(id)));
create policy "owner updates world" on public.worlds
  for update to authenticated
  using ((select public.world_role(id)) = 'owner')
  with check (owner_id = (select auth.uid()));

-- 5. world_members: membros veem quem participa do mundo; escrita só pelas RPCs.
create policy "members read members" on public.world_members
  for select to authenticated
  using ((select public.can_read_world(world_id)));

-- 6. calendars: membros leem; owner e editor alteram. Criado junto com o mundo (create_world).
create policy "members read calendars" on public.calendars
  for select to authenticated
  using ((select public.can_read_world(world_id)));
create policy "editors insert calendars" on public.calendars
  for insert to authenticated
  with check ((select public.can_edit_world(world_id)));
create policy "editors update calendars" on public.calendars
  for update to authenticated
  using ((select public.can_edit_world(world_id)))
  with check ((select public.can_edit_world(world_id)));

-- 7. Tabelas filhas de mundo: o mesmo modelo para todas.
do $$
declare
  t text;
begin
  foreach t in array array[
    'assets', 'maps', 'map_links', 'map_image_versions', 'entities', 'entity_relations',
    'entity_mentions', 'events', 'event_participants', 'map_tokens', 'token_keyframes',
    'map_annotations', 'external_links'
  ] loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using ((select public.can_read_world(world_id)))', t);
    execute format(
      'create policy "editors insert" on public.%I for insert to authenticated
         with check ((select public.can_edit_world(world_id)))', t);
    execute format(
      'create policy "editors update" on public.%I for update to authenticated
         using ((select public.can_edit_world(world_id)))
         with check ((select public.can_edit_world(world_id)))', t);
    execute format(
      'create policy "editors delete" on public.%I for delete to authenticated
         using ((select public.can_edit_world(world_id)))', t);
  end loop;
end
$$;
