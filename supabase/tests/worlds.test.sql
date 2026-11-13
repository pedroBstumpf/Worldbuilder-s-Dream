-- Mundos, membros, calendários e perfis: quem lê e quem altera.
-- Ana é dona de "alpha", com Bruno como editor; Caio é dono de "beta" e estranho em "alpha".
select plan(28);

select tests.create_user('ana');
select tests.create_user('bruno');
select tests.create_user('caio');
select tests.create_world('alpha', 'ana', array['bruno']);
select tests.create_world('beta', 'caio');

-- Perfis
select is((select display_name from public.profiles where id = tests.user_id('ana')), 'Ana',
  'o cadastro cria o perfil com o nome da conta Google');

select tests.authenticate_as('ana');
select results_eq(
  $$ select display_name from public.profiles order by display_name $$,
  array['Ana', 'Bruno'],
  'perfis visíveis: o próprio e os de quem divide mundo');
select is(tests.affected($$ update public.profiles set display_name = 'Ana Lúcia' where id = tests.user_id('ana') $$),
  1::bigint, 'altera o próprio perfil');
select is(tests.affected($$ update public.profiles set display_name = 'Outro' where id = tests.user_id('bruno') $$),
  0::bigint, 'não altera o perfil de outra pessoa');
select throws_ok($$ insert into public.profiles (id, display_name) values (gen_random_uuid(), 'X') $$,
  '42501', null, 'não cria perfis');

-- Mundos: leitura
select is(tests.count_rows('worlds', tests.world('alpha')), 1::bigint, 'dona lê o mundo');
select is(tests.count_rows('worlds', tests.world('beta')), 0::bigint, 'dona de alpha não lê beta');

select tests.authenticate_as('bruno');
select is(tests.count_rows('worlds', tests.world('alpha')), 1::bigint, 'editor lê o mundo');
select is(tests.count_rows('world_members', tests.world('alpha')), 2::bigint, 'editor vê os membros');
select is(tests.count_rows('calendars', tests.world('alpha')), 1::bigint, 'editor lê o calendário');

select tests.authenticate_as('caio');
select is(tests.count_rows('worlds', tests.world('alpha')), 0::bigint, 'estranho não lê o mundo');
select is(tests.count_rows('world_members', tests.world('alpha')), 0::bigint, 'estranho não vê os membros');
select is(tests.count_rows('calendars', tests.world('alpha')), 0::bigint, 'estranho não lê o calendário');

-- Mundos: escrita
select tests.authenticate_as('bruno');
select is(tests.affected($$ update public.worlds set name = 'Renomeado' where id = tests.world('alpha') $$),
  0::bigint, 'editor não altera o mundo');
select is(tests.affected($$ update public.calendars set definition = definition where world_id = tests.world('alpha') $$),
  1::bigint, 'editor altera o calendário');
select throws_ok(
  format($$ insert into public.world_members (world_id, user_id, role) values (%L, %L, 'editor') $$,
    tests.world('alpha'), tests.user_id('caio')),
  '42501', null, 'editor não adiciona membros');

select tests.authenticate_as('caio');
select is(tests.affected($$ update public.worlds set name = 'Invadido' where id = tests.world('alpha') $$),
  0::bigint, 'estranho não altera o mundo');
select is(tests.affected($$ update public.calendars set definition = definition where world_id = tests.world('alpha') $$),
  0::bigint, 'estranho não altera o calendário');

select tests.authenticate_as('ana');
select is(tests.affected($$ update public.worlds set name = 'Alpha Prime' where id = tests.world('alpha') $$),
  1::bigint, 'dona altera o mundo');
select is(tests.affected($$ update public.worlds set deleted_at = now() where id = tests.world('alpha') $$),
  1::bigint, 'dona põe o mundo na lixeira');
select throws_ok(
  format($$ update public.worlds set owner_id = %L where id = %L $$,
    tests.user_id('bruno'), tests.world('alpha')),
  '42501', null, 'dona não transfere o mundo por update');
select throws_ok(
  format($$ insert into public.worlds (owner_id, name) values (%L, 'Novo') $$, tests.user_id('ana')),
  '42501', null, 'mundos só nascem pela RPC create_world');
select is(tests.affected($$ delete from public.worlds where id = tests.world('alpha') $$),
  0::bigint, 'nem a dona apaga o mundo direto (só pela RPC)');
select is(tests.affected($$ delete from public.world_members where world_id = tests.world('alpha') and user_id = tests.user_id('bruno') $$),
  0::bigint, 'dona não remove membros direto (só pela RPC)');

-- anon
select tests.authenticate_as_anon();
select throws_ok(format($$ select tests.count_rows('worlds', %L) $$, tests.world('alpha')),
  '42501', null, 'anon não lê mundos');
select throws_ok(format($$ select tests.count_rows('world_members', %L) $$, tests.world('alpha')),
  '42501', null, 'anon não lê membros');
select throws_ok($$ select 1 from public.profiles $$, '42501', null, 'anon não lê perfis');

-- Conferência como postgres: o update da dona subiu a versão duas vezes
select tests.clear_authentication();
select is((select version from public.worlds where id = tests.world('alpha')), 3,
  'cada alteração do mundo sobe a versão');

select * from finish();
