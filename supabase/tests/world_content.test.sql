-- Conteúdo dos mundos (as 13 tabelas filhas): dona e editor leem e escrevem; estranho e anon, nada.
-- Ana é dona de "alpha", com Bruno como editor; Caio é dono de "beta" e estranho em "alpha".
-- Cada bloco roda uma asserção por tabela de tests.content_tables() (13).
select plan(156);

select tests.create_user('ana');
select tests.create_user('bruno');
select tests.create_user('caio');
select tests.create_world('alpha', 'ana', array['bruno']);
select tests.create_world('beta', 'caio');

-- Leitura (4 × 13)
select tests.authenticate_as('ana');
select ok(tests.count_rows(t, tests.world('alpha')) > 0, format('dona lê %s', t))
from unnest(tests.content_tables()) t;

select tests.authenticate_as('bruno');
select ok(tests.count_rows(t, tests.world('alpha')) > 0, format('editor lê %s', t))
from unnest(tests.content_tables()) t;

select tests.authenticate_as('caio');
select is(tests.count_rows(t, tests.world('alpha')), 0::bigint, format('estranho não lê %s', t))
from unnest(tests.content_tables()) t;

select tests.authenticate_as_anon();
select throws_ok(format('select tests.count_rows(%L, %L)', t, tests.world('alpha')),
  '42501', null, format('anon não lê %s', t))
from unnest(tests.content_tables()) t;

-- Inserção (3 × 13). A cópia muda o que for único para não colidir com a linha original.
select tests.clear_authentication();
create temporary table insert_cases on commit drop as
select t as table_name,
       tests.row_of(t, tests.world('alpha'), case t
         when 'map_tokens' then jsonb_build_object('entity_id', null, 'event_id', tests.id('event', 'alpha'))
         when 'token_keyframes' then jsonb_build_object('tick', 999)
         when 'map_image_versions' then jsonb_build_object('tick_start', 999)
         when 'entity_mentions' then jsonb_build_object(
           'source_kind', 'event', 'source_id', tests.id('event', 'alpha'))
         when 'event_participants' then jsonb_build_object('entity_id', tests.id('location', 'alpha'))
         else '{}'::jsonb
       end) as row_data
from unnest(tests.content_tables()) t;
grant select on insert_cases to anon, authenticated;

select tests.authenticate_as('caio');
select throws_ok(format('select tests.insert_row(%L, %L)', table_name, row_data),
  '42501', null, format('estranho não insere em %s', table_name))
from insert_cases;

select tests.authenticate_as_anon();
select throws_ok(format('select tests.insert_row(%L, %L)', table_name, row_data),
  '42501', null, format('anon não insere em %s', table_name))
from insert_cases;

select tests.authenticate_as('bruno');
select lives_ok(format('select tests.insert_row(%L, %L)', table_name, row_data),
  format('editor insere em %s', table_name))
from insert_cases;

-- Alteração (3 × 13)
select tests.authenticate_as('caio');
select is(tests.count_updated(t, tests.world('alpha')), 0::bigint, format('estranho não altera %s', t))
from unnest(tests.content_tables()) t;

select tests.authenticate_as_anon();
select throws_ok(format('select tests.count_updated(%L, %L)', t, tests.world('alpha')),
  '42501', null, format('anon não altera %s', t))
from unnest(tests.content_tables()) t;

select tests.authenticate_as('bruno');
select ok(tests.count_updated(t, tests.world('alpha')) > 0, format('editor altera %s', t))
from unnest(tests.content_tables()) t;

-- Exclusão (2 × 13): estranho não apaga nada; editor apaga tudo, das folhas para a raiz.
select tests.authenticate_as('caio');
select is(tests.count_deleted(t, tests.world('alpha')), 0::bigint, format('estranho não apaga %s', t))
from unnest(tests.content_tables()) t;

select tests.authenticate_as('bruno');
select ok(tests.count_deleted(t, tests.world('alpha')) > 0, format('editor apaga %s', t))
from unnest(tests.content_tables()) t;

select * from finish();
