-- Ajudantes dos testes pgTAP (docs/07 › Testes do banco).
-- O pnpm db:test executa este arquivo antes de cada *.test.sql, na mesma transação,
-- e desfaz tudo no fim: o schema `tests`, os usuários e os mundos não ficam no banco.

create extension if not exists pgtap with schema extensions;
set local search_path to public, extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Nome legível → id de cada coisa criada pelos testes (usuário, mundo, linha de tabela).
create table tests.fixtures (
  kind text not null,
  name text not null,
  id   uuid not null,
  primary key (kind, name)
);

create function tests.id(p_kind text, p_name text)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select f.id from tests.fixtures f where f.kind = p_kind and f.name = p_name $$;

create function tests.user_id(p_name text)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select tests.id('user', p_name) $$;

create function tests.world(p_name text)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select tests.id('world', p_name) $$;

-- Cria a conta direto em auth.users (o trigger handle_new_user cria o perfil).
create function tests.create_user(p_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_name || '@wbdream.test', '{"provider": "google"}',
    jsonb_build_object('full_name', initcap(p_name)), now(), now()
  );
  insert into tests.fixtures (kind, name, id) values ('user', p_name, v_id);
  return v_id;
end
$$;

-- Troca o papel da transação, como o PostgREST faz com o JWT.
create function tests.authenticate_as(p_name text)
returns void
language plpgsql
as $$
declare
  v_id uuid := tests.user_id(p_name);
begin
  if v_id is null then
    raise exception 'usuário de teste % não existe', p_name;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

create function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end
$$;

-- Volta ao papel da conexão (postgres), que ignora o RLS: usado para montar e conferir dados.
create function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- Tabelas com conteúdo de mundo, na ordem em que podem ser apagadas sem cascatas entre elas.
create function tests.content_tables()
returns text[]
language sql immutable
as $$
  select array[
    'token_keyframes', 'map_tokens', 'map_annotations', 'map_links', 'map_image_versions',
    'event_participants', 'entity_mentions', 'entity_relations', 'external_links',
    'events', 'entities', 'maps', 'assets'
  ]
$$;

-- Mundo completo, com uma linha em cada tabela (criado como postgres, sem passar pelo RLS).
create function tests.create_world(p_name text, p_owner text, p_editors text[] default '{}')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner uuid := tests.user_id(p_owner);
  v_world uuid := gen_random_uuid();
  v_asset uuid := gen_random_uuid();
  v_map uuid := gen_random_uuid();
  v_submap uuid := gen_random_uuid();
  v_character uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_editor text;
begin
  insert into public.worlds (id, owner_id, name) values (v_world, v_owner, initcap(p_name));
  insert into public.world_members (world_id, user_id, role) values (v_world, v_owner, 'owner');
  foreach v_editor in array p_editors loop
    insert into public.world_members (world_id, user_id, role)
    values (v_world, tests.user_id(v_editor), 'editor');
  end loop;
  insert into public.calendars (world_id, definition)
  values (v_world, '{"months": [{"name": "Único", "days": 30}], "hoursPerDay": 24}');

  insert into public.assets (id, world_id, source, storage_path, mime_type, width, height, size_bytes, created_by)
  values (v_asset, v_world, 'storage', v_world || '/' || v_asset || '/original.webp', 'image/webp', 2048, 1024, 1000, v_owner);
  insert into public.maps (id, world_id, name, image_asset_id, width, height)
  values (v_map, v_world, 'Continente', v_asset, 2048, 1024);
  insert into public.maps (id, world_id, parent_map_id, name, width, height)
  values (v_submap, v_world, v_map, 'Cidade', 1024, 1024);
  insert into public.map_links (world_id, map_id, target_map_id, polygon)
  values (v_world, v_map, v_submap, '[[0, 0], [10, 0], [10, 10]]');
  insert into public.map_image_versions (world_id, map_id, image_asset_id, tick_start, created_by)
  values (v_world, v_map, v_asset, 1000, v_owner);

  insert into public.entities (id, world_id, kind, name, created_by)
  values (v_character, v_world, 'character', 'Aria', v_owner),
         (v_location, v_world, 'location', 'Porto Velho', v_owner);
  insert into public.entity_relations (world_id, from_id, to_id, relation)
  values (v_world, v_character, v_location, 'nasceu em');
  insert into public.entity_mentions (world_id, source_kind, source_id, target_entity_id)
  values (v_world, 'entity', v_character, v_location);

  insert into public.events (id, world_id, title, tick_start, location_entity_id, created_by)
  values (v_event, v_world, 'Fundação', 0, v_location, v_owner);
  insert into public.event_participants (event_id, entity_id, world_id, role)
  values (v_event, v_character, v_world, 'fundadora');

  insert into public.map_tokens (id, world_id, map_id, entity_id)
  values (v_token, v_world, v_map, v_character);
  insert into public.token_keyframes (world_id, token_id, tick, x, y)
  values (v_world, v_token, 0, 10, 20);
  insert into public.map_annotations (world_id, map_id, kind, geometry, created_by)
  values (v_world, v_map, 'pin', '{"x": 1, "y": 2}', v_owner);
  insert into public.external_links (world_id, entity_id, provider, name, web_view_link, linked_by)
  values (v_world, v_character, 'url', 'Referência', 'https://example.com', v_owner);

  insert into tests.fixtures (kind, name, id) values
    ('world', p_name, v_world), ('asset', p_name, v_asset), ('map', p_name, v_map),
    ('submap', p_name, v_submap), ('character', p_name, v_character),
    ('location', p_name, v_location), ('event', p_name, v_event), ('token', p_name, v_token);
  return v_world;
end
$$;

-- Contagens feitas com o papel atual (security invoker): respeitam o RLS.
create function tests.count_rows(p_table text, p_world uuid)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from public.%I where %I = $1',
    p_table, case when p_table = 'worlds' then 'id' else 'world_id' end)
    into v_count using p_world;
  return v_count;
end
$$;

-- Atualiza sem mudar nada (dispara os triggers) e devolve quantas linhas o RLS deixou alterar.
create function tests.count_updated(p_table text, p_world uuid)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format(
    'with changed as (update public.%I set world_id = world_id where world_id = $1 returning 1)
     select count(*) from changed', p_table)
    into v_count using p_world;
  return v_count;
end
$$;

create function tests.count_deleted(p_table text, p_world uuid)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format(
    'with removed as (delete from public.%I where world_id = $1 returning 1)
     select count(*) from removed', p_table)
    into v_count using p_world;
  return v_count;
end
$$;

-- Executa um insert/update/delete com o papel atual e devolve quantas linhas ele alterou.
create function tests.affected(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Cópia de uma linha existente do mundo (lida como postgres), com id novo e campos trocados.
create function tests.row_of(p_table text, p_world uuid, p_changes jsonb default '{}')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where world_id = $1 limit 1', p_table)
    into v_row using p_world;
  if v_row ? 'id' then
    v_row := jsonb_set(v_row, '{id}', to_jsonb(gen_random_uuid()));
  end if;
  return v_row || p_changes;
end
$$;

-- Insere a linha com o papel atual (respeita o RLS); ignora colunas geradas.
create function tests.insert_row(p_table text, p_row jsonb)
returns void
language plpgsql
as $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = ('public.' || quote_ident(p_table))::regclass
    and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
    p_table, v_columns, v_columns, p_table)
    using p_row;
end
$$;

grant select on tests.fixtures to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;
