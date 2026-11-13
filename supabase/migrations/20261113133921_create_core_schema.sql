-- Schema inicial do Worldbuilder's Dream (docs/07 › DDL de referência).
-- O RLS é ligado em cada tabela logo na criação (sem políticas = ninguém acessa);
-- as funções de autorização, as políticas e os privilégios vêm na migração seguinte.
-- O schema `private` (lista de acesso, convites, credenciais do Google) entra na F2-02 e na F3-01.

-- 0. Extensões
create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Busca sem acentos (docs/07 › Convenções): colunas geradas exigem função IMMUTABLE,
-- e o unaccent() da extensão é só STABLE (depende do search_path para achar o dicionário).
create function public.wd_unaccent(p_text text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, p_text) $$;

-- 1. Tipos
create type public.member_role as enum ('owner', 'editor');
create type public.interp_mode as enum ('linear', 'step', 'ease');
create type public.asset_source as enum ('storage', 'google_drive', 'external_url');

-- 2. Perfis (1:1 com auth.users)
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_path  text,
  locale       text not null default 'pt-BR',
  ui_prefs     jsonb not null default '{}'::jsonb check (pg_column_size(ui_prefs) < 16384),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 3. Mundos e membros
create table public.worlds (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  description    text check (char_length(description) <= 2000),
  cover_asset_id uuid,                                   -- FK para assets, abaixo
  time_start     bigint not null default 0,
  time_end       bigint not null default 525600 * 100,   -- 100 anos em minutos
  now_tick       bigint,                                 -- "agora da narrativa" opcional
  archived_at    timestamptz,
  deleted_at     timestamptz,
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (time_end > time_start)
);
create index worlds_owner_id_idx on public.worlds (owner_id);
alter table public.worlds enable row level security;

create table public.world_members (
  world_id   uuid not null references public.worlds (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (world_id, user_id)
);
create index world_members_user_id_idx on public.world_members (user_id);
alter table public.world_members enable row level security;

create table public.calendars (
  world_id   uuid primary key references public.worlds (id) on delete cascade,
  definition jsonb not null,           -- validado no cliente (zod) e pelas chaves mínimas abaixo
  updated_at timestamptz not null default now(),
  check (definition ? 'months' and definition ? 'hoursPerDay')
);
alter table public.calendars enable row level security;

-- 4. Assets (imagens)
create table public.assets (
  id           uuid primary key default gen_random_uuid(),
  world_id     uuid not null references public.worlds (id) on delete cascade,
  source       public.asset_source not null,
  storage_path text,                    -- quando source = 'storage'
  external_id  text,                    -- id do arquivo no Drive
  external_url text check (external_url is null or external_url ~ '^https://'),
  mime_type    text not null,
  width        int,
  height       int,
  size_bytes   bigint not null default 0,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (
    (source = 'storage' and storage_path is not null) or
    (source = 'google_drive' and external_id is not null) or
    (source = 'external_url' and external_url is not null)
  )
);
create index assets_world_id_idx on public.assets (world_id);
create index assets_created_by_idx on public.assets (created_by);
alter table public.assets enable row level security;

alter table public.worlds
  add constraint worlds_cover_asset_id_fkey
  foreign key (cover_asset_id) references public.assets (id) on delete set null;
create index worlds_cover_asset_id_idx on public.worlds (cover_asset_id);

-- 5. Mapas
create table public.maps (
  id             uuid primary key default gen_random_uuid(),
  world_id       uuid not null references public.worlds (id) on delete cascade,
  parent_map_id  uuid references public.maps (id) on delete set null,
  name           text not null check (char_length(name) between 1 and 120),
  image_asset_id uuid references public.assets (id) on delete set null,
  width          int not null check (width between 1 and 32768),
  height         int not null check (height between 1 and 32768),
  scale_value    double precision check (scale_value > 0),  -- unidades por pixel
  scale_unit     text check (scale_unit in ('m', 'km', 'mi', 'league', 'day_walk', 'custom')),
  scale_label    text,
  sort_order     int not null default 0,
  deleted_at     timestamptz,
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index maps_world_id_parent_map_id_idx on public.maps (world_id, parent_map_id);
create index maps_parent_map_id_idx on public.maps (parent_map_id);
create index maps_image_asset_id_idx on public.maps (image_asset_id);
alter table public.maps enable row level security;

create table public.map_links (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references public.worlds (id) on delete cascade,
  map_id        uuid not null references public.maps (id) on delete cascade,
  target_map_id uuid not null references public.maps (id) on delete cascade,
  polygon       jsonb not null,         -- [[x,y],...] em coordenadas do mapa-pai
  check (map_id <> target_map_id)
);
create index map_links_world_id_idx on public.map_links (world_id);
create index map_links_map_id_idx on public.map_links (map_id);
create index map_links_target_map_id_idx on public.map_links (target_map_id);
alter table public.map_links enable row level security;

-- Versões da imagem no tempo (docs/06 §1): a imagem do mapa vale até a primeira versão;
-- cada versão vale até o tick_start da seguinte
create table public.map_image_versions (
  id             uuid primary key default gen_random_uuid(),
  world_id       uuid not null references public.worlds (id) on delete cascade,
  map_id         uuid not null references public.maps (id) on delete cascade,
  image_asset_id uuid references public.assets (id) on delete set null,
  tick_start     bigint not null,
  deleted_at     timestamptz,
  version        int not null default 1,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index map_image_versions_map_id_tick_start_key
  on public.map_image_versions (map_id, tick_start) where deleted_at is null;
create index map_image_versions_world_id_idx on public.map_image_versions (world_id);
create index map_image_versions_map_id_idx on public.map_image_versions (map_id);
create index map_image_versions_image_asset_id_idx on public.map_image_versions (image_asset_id);
create index map_image_versions_created_by_idx on public.map_image_versions (created_by);
alter table public.map_image_versions enable row level security;

-- 6. Entidades
create table public.entities (
  id                uuid primary key default gen_random_uuid(),
  world_id          uuid not null references public.worlds (id) on delete cascade,
  kind              text not null check (kind in ('character', 'location', 'faction', 'item', 'note')),
  name              text not null check (char_length(name) between 1 and 160),
  subtitle          text check (char_length(subtitle) <= 200),
  color             text check (color ~ '^#[0-9a-fA-F]{6}$'),
  portrait_asset_id uuid references public.assets (id) on delete set null,
  aliases           text[] not null default '{}',   -- apelidos, para reconhecer a entidade nos Google Docs
  attributes        jsonb not null default '{}'::jsonb check (pg_column_size(attributes) < 65536),
  content           jsonb,                          -- Tiptap
  content_text      text check (char_length(content_text) <= 500000),
  born_tick         bigint,
  died_tick         bigint,
  tags              text[] not null default '{}',
  search            tsvector generated always as (
                      setweight(to_tsvector('simple', public.wd_unaccent(coalesce(name, ''))), 'A') ||
                      setweight(to_tsvector('simple', public.wd_unaccent(coalesce(subtitle, ''))), 'B') ||
                      setweight(to_tsvector('simple', public.wd_unaccent(coalesce(content_text, ''))), 'C')
                    ) stored,
  deleted_at        timestamptz,
  version           int not null default 1,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index entities_world_id_kind_idx on public.entities (world_id, kind) where deleted_at is null;
create index entities_world_id_idx on public.entities (world_id);
create index entities_portrait_asset_id_idx on public.entities (portrait_asset_id);
create index entities_created_by_idx on public.entities (created_by);
create index entities_search_idx on public.entities using gin (search);
alter table public.entities enable row level security;

create table public.entity_relations (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds (id) on delete cascade,
  from_id    uuid not null references public.entities (id) on delete cascade,
  to_id      uuid not null references public.entities (id) on delete cascade,
  relation   text not null check (char_length(relation) between 1 and 60), -- 'pai de', 'aliado', 'membro de'
  tick_start bigint,
  tick_end   bigint,
  check (from_id <> to_id)
);
create index entity_relations_world_id_from_id_idx on public.entity_relations (world_id, from_id);
create index entity_relations_from_id_idx on public.entity_relations (from_id);
create index entity_relations_to_id_idx on public.entity_relations (to_id);
alter table public.entity_relations enable row level security;

-- Menções (@entidade) dentro de textos ricos; mantidas pelo cliente ao salvar o conteúdo
create table public.entity_mentions (
  world_id         uuid not null references public.worlds (id) on delete cascade,
  source_kind      text not null check (source_kind in ('entity', 'event')),
  source_id        uuid not null,       -- entidade ou evento que contém o texto
  target_entity_id uuid not null references public.entities (id) on delete cascade,
  primary key (source_kind, source_id, target_entity_id)
);
create index entity_mentions_target_entity_id_idx on public.entity_mentions (target_entity_id); -- "onde é citada"
create index entity_mentions_world_id_idx on public.entity_mentions (world_id);
alter table public.entity_mentions enable row level security;

-- 7. Eventos
create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  world_id           uuid not null references public.worlds (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  category           text not null default 'general',
  tick_start         bigint not null,
  tick_end           bigint,
  location_entity_id uuid references public.entities (id) on delete set null,
  content            jsonb,
  content_text       text check (char_length(content_text) <= 200000),
  color              text check (color ~ '^#[0-9a-fA-F]{6}$'),
  search             tsvector generated always as (
                       setweight(to_tsvector('simple', public.wd_unaccent(coalesce(title, ''))), 'A') ||
                       setweight(to_tsvector('simple', public.wd_unaccent(coalesce(content_text, ''))), 'C')
                     ) stored,
  deleted_at         timestamptz,
  version            int not null default 1,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (tick_end is null or tick_end >= tick_start)
);
create index events_world_id_tick_start_idx on public.events (world_id, tick_start) where deleted_at is null;
create index events_world_id_idx on public.events (world_id);
create index events_location_entity_id_idx on public.events (location_entity_id);
create index events_created_by_idx on public.events (created_by);
create index events_search_idx on public.events using gin (search);
alter table public.events enable row level security;

create table public.event_participants (
  event_id  uuid not null references public.events (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  world_id  uuid not null references public.worlds (id) on delete cascade,
  role      text,
  primary key (event_id, entity_id)
);
create index event_participants_entity_id_idx on public.event_participants (entity_id);
create index event_participants_world_id_idx on public.event_participants (world_id);
alter table public.event_participants enable row level security;

-- 8. Tokens e keyframes
create table public.map_tokens (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds (id) on delete cascade,
  map_id     uuid not null references public.maps (id) on delete cascade,
  entity_id  uuid references public.entities (id) on delete cascade,
  event_id   uuid references public.events (id) on delete cascade,
  size       real not null default 1 check (size between 0.1 and 10),
  style      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((entity_id is null) <> (event_id is null)),       -- exatamente um
  unique (map_id, entity_id),
  unique (map_id, event_id)
);
create index map_tokens_world_id_idx on public.map_tokens (world_id);
create index map_tokens_entity_id_idx on public.map_tokens (entity_id);
create index map_tokens_event_id_idx on public.map_tokens (event_id);
alter table public.map_tokens enable row level security;

-- O unique (token_id, tick) já cria o índice da busca por janela de tempo.
create table public.token_keyframes (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references public.worlds (id) on delete cascade,
  token_id      uuid not null references public.map_tokens (id) on delete cascade,
  tick          bigint not null,
  x             real not null,
  y             real not null,
  visible       boolean not null default true,
  interpolation public.interp_mode not null default 'linear',
  note          text check (char_length(note) <= 500),
  updated_at    timestamptz not null default now(),
  unique (token_id, tick)
);
create index token_keyframes_world_id_idx on public.token_keyframes (world_id);
alter table public.token_keyframes enable row level security;

-- 9. Anotações (pinos, traços, regiões, rótulos, medições)
create table public.map_annotations (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds (id) on delete cascade,
  map_id     uuid not null references public.maps (id) on delete cascade,
  kind       text not null check (kind in ('pin', 'stroke', 'region', 'label', 'measure')),
  geometry   jsonb not null check (pg_column_size(geometry) < 262144),
  style      jsonb not null default '{}'::jsonb,
  title      text check (char_length(title) <= 160),
  entity_id  uuid references public.entities (id) on delete set null,
  event_id   uuid references public.events (id) on delete set null,
  tick_start bigint,
  tick_end   bigint,
  z_index    int not null default 0,
  version    int not null default 1,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tick_end is null or tick_start is null or tick_end >= tick_start)
);
create index map_annotations_map_id_idx on public.map_annotations (map_id);
create index map_annotations_world_id_idx on public.map_annotations (world_id);
create index map_annotations_entity_id_idx on public.map_annotations (entity_id);
create index map_annotations_event_id_idx on public.map_annotations (event_id);
create index map_annotations_created_by_idx on public.map_annotations (created_by);
alter table public.map_annotations enable row level security;

-- 10. Vínculos externos (Google Docs/Drive, URLs)
create table public.external_links (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references public.worlds (id) on delete cascade,
  entity_id     uuid references public.entities (id) on delete cascade,   -- nulo + event nulo = vínculo do mundo
  event_id      uuid references public.events (id) on delete cascade,
  provider      text not null check (provider in ('google_doc', 'google_drive', 'url')),
  purpose       text not null default 'attachment'
                check (purpose in ('primary_text', 'chapter', 'attachment')),
  external_id   text,                                  -- id do arquivo no Drive / do Doc
  mime_type     text,
  name          text not null check (char_length(name) <= 300),
  web_view_link text check (web_view_link ~ '^https://'),
  icon_url      text check (icon_url is null or icon_url ~ '^https://'),
  revision_id   text,                                  -- última revisão do Doc vista pelo app
  sort_order    int not null default 0,                -- ordem dos capítulos na aba História
  search_text   text check (char_length(search_text) <= 2000000), -- opcional (opt-in): cópia do texto para busca
  linked_by     uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  check (not (entity_id is not null and event_id is not null))
);
-- no máximo um texto principal por alvo
create unique index external_links_primary_text_uq on public.external_links
  (world_id, coalesce(entity_id, event_id, world_id)) where purpose = 'primary_text';
create index external_links_world_id_idx on public.external_links (world_id);
create index external_links_entity_id_idx on public.external_links (entity_id);
create index external_links_event_id_idx on public.external_links (event_id);
create index external_links_linked_by_idx on public.external_links (linked_by);
alter table public.external_links enable row level security;
