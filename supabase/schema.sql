-- skew / biasly — canonical database schema (AGENTS.md §7).
--
-- HOW TO APPLY: Supabase Dashboard → SQL Editor → paste this whole file → Run.
-- The file is idempotent; running it twice is safe and makes no changes the
-- second time.
--
-- ACCESS MODEL: authentication is Clerk, not Supabase Auth (§6), so no request
-- ever carries a Supabase user JWT. Every read and write happens server-side
-- with the service-role key (lib/supabase/service.ts). Row Level Security is
-- therefore enabled on every table with NO policies, and the `anon` /
-- `authenticated` roles are explicitly revoked: those roles can reach nothing.
-- The service role bypasses RLS and is the only accessor.
--
-- Keep this file, lib/supabase/types.ts, and the §7 field list in sync.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- `gen_random_uuid()` ships with Postgres 13+ (pgcrypto is preinstalled on
-- Supabase).
--
-- pgvector powers related-article similarity search (§20). Every reference to
-- the type and its operator class below is schema-qualified
-- (`extensions.vector`, `extensions.vector_cosine_ops`) so nothing depends on
-- the caller's `search_path` — the usual cause of `type "vector" does not
-- exist`. That makes WHERE pgvector lives part of this file's contract, so
-- pin it rather than assuming:
--
--   * not installed          → install it into `extensions`
--   * installed elsewhere    → relocate it (pgvector is relocatable)
--   * already in `extensions`→ do nothing
--
-- A plain `create extension if not exists vector with schema extensions` cannot
-- do this: when the extension already exists in another schema, IF NOT EXISTS
-- silently leaves it there and every qualified reference below then fails.
do $$
declare
  ext_schema text;
begin
  select n.nspname
    into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'vector';

  if ext_schema is null then
    create extension vector with schema extensions;
  elsif ext_schema <> 'extensions' then
    raise notice 'Relocating pgvector from % to extensions', ext_schema;
    alter extension vector set schema extensions;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (never DEFINER) and an empty search_path, per the Supabase
-- security checklist.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- sources — scrape targets. Homepage entry URLs only (§9, §11).
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  listing_url     text not null unique,
  parser_strategy text,
  logo_url        text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.sources.listing_url is
  'Homepage entry page only — never a section, category, or topic path (§9).';
comment on column public.sources.parser_strategy is
  'Short slug picking the source-specific link extractor (§11).';

-- ---------------------------------------------------------------------------
-- articles — append-only scrape output (§10).
-- ---------------------------------------------------------------------------
-- image_url and published_at are NOT NULL: the article content gate (§9, §13)
-- is enforced by the database, not only by application code.
create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.sources (id) on delete cascade,
  url           text not null unique,
  canonical_url text,
  title         text not null,
  image_url     text not null,
  published_at  timestamptz not null,
  raw_text      text not null,
  scraped_at    timestamptz not null default now(),
  analyzed_at   timestamptz,
  created_at    timestamptz not null default now()
);

comment on column public.articles.url is
  'Original article URL. Unique — the primary dedupe key (§10).';
comment on column public.articles.canonical_url is
  'Canonical URL when the page declares one. Secondary dedupe key (§10).';
comment on column public.articles.analyzed_at is
  'Set only after a valid analysis row is saved (§19.6).';

-- ---------------------------------------------------------------------------
-- article_analyses — one AI analysis per article (§19).
-- ---------------------------------------------------------------------------
-- `embedding` (§20) is added by the ALTER below rather than inline, so this file
-- stays runnable against a database created before pgvector was enabled.
create table if not exists public.article_analyses (
  id                uuid primary key default gen_random_uuid(),
  article_id        uuid not null unique
                      references public.articles (id) on delete cascade,
  summary           text not null,
  sentiment_score   numeric not null check (sentiment_score between -1 and 1),
  sentiment_label   text not null
                      check (sentiment_label in ('positive', 'neutral', 'negative')),
  bias_score        numeric not null check (bias_score between -1 and 1),
  bias_label        text not null
                      check (bias_label in ('left', 'center', 'right', 'mixed', 'unclear')),
  left_percentage   integer not null check (left_percentage between 0 and 100),
  center_percentage integer not null check (center_percentage between 0 and 100),
  right_percentage  integer not null check (right_percentage between 0 and 100),
  confidence        numeric not null check (confidence between 0 and 1),
  framing_notes     text,
  loaded_terms      text[] not null default '{}',
  disclaimer        text,
  model             text not null,
  created_at        timestamptz not null default now(),
  constraint article_analyses_percentages_sum_100
    check (left_percentage + center_percentage + right_percentage = 100)
);

comment on column public.article_analyses.bias_score is
  'Derived: (right_percentage - left_percentage) / 100 (§19).';

-- §20. Separate from CREATE TABLE so an existing database picks it up too.
alter table public.article_analyses
  add column if not exists embedding extensions.vector(1536);

comment on column public.article_analyses.embedding is
  'OpenAI text-embedding-3-small vector; NULL until the analysis run embeds the article (§20).';

-- ---------------------------------------------------------------------------
-- logs — pipeline run logging (§9).
-- ---------------------------------------------------------------------------
create table if not exists public.logs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level      text not null check (level in ('debug', 'info', 'warn', 'error')),
  event      text not null,
  message    text,
  context    jsonb,
  source_id  uuid references public.sources (id) on delete set null,
  article_id uuid references public.articles (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- oxylabs_schedules / oxylabs_schedule_runs (§18).
-- ---------------------------------------------------------------------------
-- schedule_id and job_id are TEXT, never numeric: Oxylabs returns 64-bit
-- integers that exceed Number.MAX_SAFE_INTEGER and are silently corrupted by
-- JSON.parse. Storing them as text keeps the exact digit sequence.
create table if not exists public.oxylabs_schedules (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null unique
                    references public.sources (id) on delete cascade,
  schedule_id     text not null unique,
  cron_expression text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.oxylabs_schedule_runs (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   text not null
                  references public.oxylabs_schedules (schedule_id) on delete cascade,
  job_id        text not null unique,
  result_status text,
  run_at        timestamptz,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

comment on column public.oxylabs_schedule_runs.result_status is
  'Per-job status from GET /schedules/{id}/runs; only ''done'' jobs are fetched (§18).';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists sources_set_updated_at on public.sources;
create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

drop trigger if exists oxylabs_schedules_set_updated_at on public.oxylabs_schedules;
create trigger oxylabs_schedules_set_updated_at
  before update on public.oxylabs_schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists articles_source_id_idx
  on public.articles (source_id);
create index if not exists articles_published_at_idx
  on public.articles (published_at desc);
create index if not exists articles_scraped_at_idx
  on public.articles (scraped_at desc);

-- Pending-analysis scans (§19.1) only ever look at unanalyzed rows.
create index if not exists articles_pending_analysis_idx
  on public.articles (scraped_at) where analyzed_at is null;

-- Secondary dedupe key; NULL canonical URLs must not collide with each other.
create unique index if not exists articles_canonical_url_key
  on public.articles (canonical_url) where canonical_url is not null;

create index if not exists sources_is_active_idx
  on public.sources (is_active) where is_active;

create index if not exists logs_created_at_idx
  on public.logs (created_at desc);
create index if not exists logs_article_id_idx
  on public.logs (article_id);

-- Related-article similarity search (§20). IVFFlat builds its lists from the
-- rows present at creation time, so on a small or empty table recall is poor:
-- run `reindex index public.article_analyses_embedding_idx;` once the table is
-- well populated.
create index if not exists article_analyses_embedding_idx
  on public.article_analyses
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

-- Embedding backfill scans (§20) only ever look at rows still missing a vector.
create index if not exists article_analyses_embedding_pending_idx
  on public.article_analyses (article_id) where embedding is null;

create index if not exists oxylabs_schedule_runs_schedule_id_idx
  on public.oxylabs_schedule_runs (schedule_id);
create index if not exists oxylabs_schedule_runs_unprocessed_idx
  on public.oxylabs_schedule_runs (job_id) where processed_at is null;

-- ---------------------------------------------------------------------------
-- match_related_articles — related stories by cosine similarity (§20)
-- ---------------------------------------------------------------------------
-- PostgREST cannot express `order by embedding <=> $1`, so the ordering lives
-- here and the app calls this through `.rpc()`.
--
-- SECURITY INVOKER (never DEFINER: a DEFINER function in `public` is an open
-- API endpoint for every role) and an empty search_path, so the `<=>` operator
-- is written schema-qualified as `operator(extensions.<=>)`. EXECUTE is revoked
-- from PUBLIC below — Postgres grants it by default — leaving service_role as
-- the only caller.
create or replace function public.match_related_articles(
  p_article_id  uuid,
  p_embedding   extensions.vector(1536),
  p_match_count integer
)
returns table (
  article_id   uuid,
  title        text,
  image_url    text,
  published_at timestamptz,
  raw_text     text,
  source_name  text,
  similarity   double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    a.title,
    a.image_url,
    a.published_at,
    a.raw_text,
    s.name,
    1 - (an.embedding operator(extensions.<=>) p_embedding)
  from public.article_analyses as an
  join public.articles as a on a.id = an.article_id
  join public.sources  as s on s.id = a.source_id
  where an.embedding is not null
    and a.analyzed_at is not null
    and a.id <> p_article_id
  order by an.embedding operator(extensions.<=>) p_embedding
  limit p_match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security + grants
-- ---------------------------------------------------------------------------
-- RLS on, zero policies, and no grants to anon/authenticated. Nothing is
-- reachable through the Data API; the service role (which bypasses RLS) is the
-- only accessor. See the ACCESS MODEL note at the top of this file.
alter table public.sources               enable row level security;
alter table public.articles              enable row level security;
alter table public.article_analyses      enable row level security;
alter table public.logs                  enable row level security;
alter table public.oxylabs_schedules     enable row level security;
alter table public.oxylabs_schedule_runs enable row level security;

revoke all on public.sources               from anon, authenticated;
revoke all on public.articles              from anon, authenticated;
revoke all on public.article_analyses      from anon, authenticated;
revoke all on public.logs                  from anon, authenticated;
revoke all on public.oxylabs_schedules     from anon, authenticated;
revoke all on public.oxylabs_schedule_runs from anon, authenticated;

-- Granted explicitly rather than relying on default privileges: since
-- 2026-04-28 Supabase no longer auto-exposes new public tables to the Data API.
-- The service role bypasses RLS but still needs table privileges.
grant all on public.sources               to service_role;
grant all on public.articles              to service_role;
grant all on public.article_analyses      to service_role;
grant all on public.logs                  to service_role;
grant all on public.oxylabs_schedules     to service_role;
grant all on public.oxylabs_schedule_runs to service_role;

revoke all on function
  public.match_related_articles(uuid, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function
  public.match_related_articles(uuid, extensions.vector, integer)
  to service_role;

-- Seed data lives in supabase/seed.sql — run that next.
