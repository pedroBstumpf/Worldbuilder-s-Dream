-- Triggers e limites (docs/07 › Triggers).

-- 1. updated_at = now() em toda alteração
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 2. version = old.version + 1 em toda alteração (o cliente compara a versão vista; docs/07)
create function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'worlds', 'calendars', 'maps', 'map_image_versions', 'entities', 'events',
    'token_keyframes', 'map_annotations'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;

  foreach t in array array[
    'worlds', 'maps', 'map_image_versions', 'entities', 'events', 'map_annotations'
  ] loop
    execute format(
      'create trigger bump_version before update on public.%I
         for each row execute function public.bump_version()', t);
  end loop;
end
$$;

-- 3. world_id coerente com os pais (docs/07 › Integridade de world_id).
-- Argumentos em pares: coluna, tabela-pai. A tabela-pai `@source` resolve pela coluna
-- source_kind (entity_mentions). O world_id não muda depois de criado.
-- security definer: compara com o mundo real do pai, mesmo que o RLS o esconda do usuário.
create function public.check_world_consistency()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_world_column text := case when tg_table_name = 'worlds' then 'id' else 'world_id' end;
  v_world uuid := (v_new ->> v_world_column)::uuid;
  v_column text;
  v_parent text;
  v_parent_id uuid;
  v_parent_world uuid;
  v_polymorphic boolean;
  v_found int;
  v_i int := 0;
begin
  if tg_op = 'UPDATE' and v_world is distinct from (to_jsonb(old) ->> v_world_column)::uuid then
    raise exception using errcode = '23514', message = 'world_mismatch',
      detail = format('%s.%s não pode mudar', tg_table_name, v_world_column);
  end if;

  while v_i < tg_nargs loop
    v_column := tg_argv[v_i];
    v_parent := tg_argv[v_i + 1];
    v_polymorphic := v_parent = '@source';
    if v_polymorphic then
      v_parent := case v_new ->> 'source_kind' when 'entity' then 'entities' else 'events' end;
    end if;
    v_parent_id := (v_new ->> v_column)::uuid;
    if v_parent_id is not null then
      execute format('select world_id from public.%I where id = $1', v_parent)
        into v_parent_world using v_parent_id;
      get diagnostics v_found = row_count;  -- EXECUTE não atualiza FOUND
      -- Pai inexistente: a chave estrangeira é que responde; a coluna polimórfica não tem FK.
      if v_found > 0 and v_parent_world is distinct from v_world then
        raise exception using errcode = '23514', message = 'world_mismatch',
          detail = format('%s.%s aponta para outro mundo', tg_table_name, v_column);
      end if;
      if v_found = 0 and v_polymorphic then
        raise exception using errcode = '23503', message = 'not_found',
          detail = format('%s.%s não existe', tg_table_name, v_column);
      end if;
    end if;
    v_i := v_i + 2;
  end loop;
  return new;
end
$$;
revoke execute on function public.check_world_consistency() from public, anon, authenticated;

create trigger check_world_consistency before insert or update on public.worlds
  for each row execute function public.check_world_consistency('cover_asset_id', 'assets');
create trigger check_world_consistency before insert or update on public.calendars
  for each row execute function public.check_world_consistency();
create trigger check_world_consistency before insert or update on public.assets
  for each row execute function public.check_world_consistency();
create trigger check_world_consistency before insert or update on public.maps
  for each row execute function public.check_world_consistency(
    'parent_map_id', 'maps', 'image_asset_id', 'assets');
create trigger check_world_consistency before insert or update on public.map_links
  for each row execute function public.check_world_consistency(
    'map_id', 'maps', 'target_map_id', 'maps');
create trigger check_world_consistency before insert or update on public.map_image_versions
  for each row execute function public.check_world_consistency(
    'map_id', 'maps', 'image_asset_id', 'assets');
create trigger check_world_consistency before insert or update on public.entities
  for each row execute function public.check_world_consistency('portrait_asset_id', 'assets');
create trigger check_world_consistency before insert or update on public.entity_relations
  for each row execute function public.check_world_consistency(
    'from_id', 'entities', 'to_id', 'entities');
create trigger check_world_consistency before insert or update on public.entity_mentions
  for each row execute function public.check_world_consistency(
    'source_id', '@source', 'target_entity_id', 'entities');
create trigger check_world_consistency before insert or update on public.events
  for each row execute function public.check_world_consistency('location_entity_id', 'entities');
create trigger check_world_consistency before insert or update on public.event_participants
  for each row execute function public.check_world_consistency(
    'event_id', 'events', 'entity_id', 'entities');
create trigger check_world_consistency before insert or update on public.map_tokens
  for each row execute function public.check_world_consistency(
    'map_id', 'maps', 'entity_id', 'entities', 'event_id', 'events');
create trigger check_world_consistency before insert or update on public.token_keyframes
  for each row execute function public.check_world_consistency('token_id', 'map_tokens');
create trigger check_world_consistency before insert or update on public.map_annotations
  for each row execute function public.check_world_consistency(
    'map_id', 'maps', 'entity_id', 'entities', 'event_id', 'events');
create trigger check_world_consistency before insert or update on public.external_links
  for each row execute function public.check_world_consistency(
    'entity_id', 'entities', 'event_id', 'events');

-- 4. Perfil criado junto com a conta (o nome vem do Google; o usuário pode mudar depois).
-- A conversão de convites pendentes em world_members entra na F2-02.
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Leitor'
    ), 80)
  );
  return new;
end
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Limites técnicos das imagens (docs/02 › Limites técnicos; bucket world-assets).
-- Como restrições, não trigger: o banco recusa com 23514 (AppError 'validation').
alter table public.assets
  add constraint assets_size_bytes_check
    check (size_bytes between 0 and 20 * 1024 * 1024),
  add constraint assets_dimensions_check
    check ((width is null or width between 1 and 8192) and (height is null or height between 1 and 8192)),
  add constraint assets_storage_mime_type_check
    check (source <> 'storage' or mime_type in ('image/png', 'image/jpeg', 'image/webp'));
