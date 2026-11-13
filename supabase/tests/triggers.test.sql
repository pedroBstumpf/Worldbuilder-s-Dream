-- Triggers e limites: updated_at, version, world_id coerente, perfil no cadastro, imagens, busca.
-- Roda como postgres (sem RLS): os triggers e as restrições valem para qualquer papel.
select plan(17);

select tests.create_user('ana');
select tests.create_user('caio');
select tests.create_world('alpha', 'ana');
select tests.create_world('beta', 'caio');

-- updated_at e version
update public.entities set updated_at = '2000-01-01', name = 'Aria'
where id = tests.id('character', 'alpha');
select is((select version from public.entities where id = tests.id('character', 'alpha')), 2,
  'cada alteração sobe a versão');
update public.entities set name = 'Aria Valente' where id = tests.id('character', 'alpha');
select is((select updated_at from public.entities where id = tests.id('character', 'alpha')), now(),
  'cada alteração renova updated_at');
select is(
  tests.affected($$ update public.entities set name = 'Aria' where id = tests.id('character', 'alpha') and version = 2 $$),
  0::bigint, 'update com a versão antiga não altera nada (conflito)');

-- world_id coerente com os pais
select throws_ok(
  format($$ insert into public.entity_relations (world_id, from_id, to_id, relation)
            values (%L, %L, %L, 'rival de') $$,
    tests.world('beta'), tests.id('character', 'alpha'), tests.id('location', 'alpha')),
  '23514', 'world_mismatch', 'relação não liga entidades de outro mundo');
select throws_ok(
  format($$ insert into public.token_keyframes (world_id, token_id, tick, x, y)
            values (%L, %L, 50, 1, 1) $$,
    tests.world('beta'), tests.id('token', 'alpha')),
  '23514', 'world_mismatch', 'keyframe não pendura em token de outro mundo');
select throws_ok(
  format($$ insert into public.map_tokens (world_id, map_id, entity_id) values (%L, %L, %L) $$,
    tests.world('alpha'), tests.id('map', 'alpha'), tests.id('character', 'beta')),
  '23514', 'world_mismatch', 'token não usa entidade de outro mundo');
select throws_ok(
  format($$ insert into public.entity_mentions (world_id, source_kind, source_id, target_entity_id)
            values (%L, 'event', %L, %L) $$,
    tests.world('alpha'), tests.id('event', 'beta'), tests.id('location', 'alpha')),
  '23514', 'world_mismatch', 'menção não vem de texto de outro mundo');
select throws_ok(
  format($$ insert into public.entity_mentions (world_id, source_kind, source_id, target_entity_id)
            values (%L, 'entity', gen_random_uuid(), %L) $$,
    tests.world('alpha'), tests.id('location', 'alpha')),
  '23503', 'not_found', 'menção precisa de uma origem que exista');
select throws_ok(
  format($$ update public.worlds set cover_asset_id = %L where id = %L $$,
    tests.id('asset', 'beta'), tests.world('alpha')),
  '23514', 'world_mismatch', 'capa do mundo é uma imagem do próprio mundo');
select throws_ok(
  format($$ update public.entities set world_id = %L where id = %L $$,
    tests.world('beta'), tests.id('location', 'alpha')),
  '23514', 'world_mismatch', 'o world_id não muda depois de criado');

-- Perfil no cadastro
select tests.create_user('dora');
select is((select display_name from public.profiles where id = tests.user_id('dora')), 'Dora',
  'o cadastro cria o perfil');

-- Limites das imagens (docs/02)
select throws_ok(
  format($$ insert into public.assets (world_id, source, storage_path, mime_type, size_bytes, created_by)
            values (%L, 'storage', 'x', 'image/webp', 21 * 1024 * 1024, %L) $$,
    tests.world('alpha'), tests.user_id('ana')),
  '23514', null, 'imagem acima de 20 MB é recusada');
select throws_ok(
  format($$ insert into public.assets (world_id, source, storage_path, mime_type, width, height, created_by)
            values (%L, 'storage', 'x', 'image/webp', 9000, 100, %L) $$,
    tests.world('alpha'), tests.user_id('ana')),
  '23514', null, 'imagem acima de 8192 px é recusada');
select throws_ok(
  format($$ insert into public.assets (world_id, source, storage_path, mime_type, created_by)
            values (%L, 'storage', 'x', 'image/svg+xml', %L) $$,
    tests.world('alpha'), tests.user_id('ana')),
  '23514', null, 'só PNG, JPEG e WebP no Storage');
select lives_ok(
  format($$ insert into public.assets (world_id, source, external_id, mime_type, created_by)
            values (%L, 'google_drive', 'drive-file-id', 'image/png', %L) $$,
    tests.world('alpha'), tests.user_id('ana')),
  'imagem do Drive é aceita');

-- Busca sem acentos
update public.entities set name = 'Âncora de São João' where id = tests.id('location', 'alpha');
select ok(
  (select search @@ to_tsquery('simple', public.wd_unaccent('ancora & sao'))
   from public.entities where id = tests.id('location', 'alpha')),
  'a busca ignora acentos');
select ok(
  (select search @@ to_tsquery('simple', public.wd_unaccent('Fundação'))
   from public.events where id = tests.id('event', 'alpha')),
  'a busca de eventos também');

select * from finish();
