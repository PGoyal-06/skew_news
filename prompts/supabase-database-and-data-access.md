# Prompt: Supabase database + data access layer

## Goal

Stand up the Supabase persistence foundation for skew / biasly and put the UI
on it:

1. `supabase/schema.sql` — the canonical DDL for the six core tables of
   AGENTS §7 (`sources`, `articles`, `article_analyses`, `logs`,
   `oxylabs_schedules`, `oxylabs_schedule_runs`), with constraints, indexes,
   and RLS locked down.
2. `lib/supabase/*` — a typed, **server-only** data-access layer (service-role
   client + query modules) that every later feature (scraping §9/§16,
   scheduler §18, AI analysis §19, pgvector §20) calls instead of touching
   supabase-js directly.
3. **Rewire the home and details pages onto those queries** and delete
   `lib/mock/*`. Until sources are seeded and a scrape + analysis run, both
   pages render honest empty states.

No API routes, no scraping, and no AI in this task.

## Skills / docs read

- `AGENTS.md` (full) — workflow §2, prompt spec §4, layering §5, stack §6,
  schema source of truth §7, pipeline rules §9 (URL existence check, article
  content gate, run logging), storage rules §10, scheduler storage §18,
  analysis fields + pending-analysis check §19, card/details field lists §19,
  pgvector §20, security §21, checks §22.
- `.agents/skills/supabase/SKILL.md` — verify against the changelog before
  implementing; RLS on every table in an exposed schema; never expose the
  service-role key to browser code; avoid `SECURITY DEFINER`; pin package
  versions and commit the lockfile; the `.eq('foreignTable.col')` gotcha.
- `.agents/skills/supabase-postgres-best-practices/SKILL.md` — schema design,
  indexing, and RLS rule categories (this install ships `SKILL.md` only; the
  `references/` rule files are not present).
- `https://supabase.com/changelog.md` — checked for breaking changes:
  - **2026-04-28** new `public` tables are no longer auto-exposed to the Data
    API (mandatory 2026-10-30). This project reads and writes exclusively with
    the service-role key from the server, so we deliberately do **not** grant
    `anon` / `authenticated` access.
  - **2026-07-10** `@supabase/supabase-js` will require TypeScript 5.0+ — the
    project is already on TS ^5.
  - Node 20 support ends 2026-06-30; local Node is v24.16.0 — fine.
- `https://supabase.com/docs/guides/database/extensions/pgvector.md` — read for
  §20 planning only. Per AGENTS §7 the `embedding vector(1536)` column is
  **not** part of this initial schema.

## Existing code inspected

- `.env.example` / `.env.local` — `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are present and
  set locally. No new env vars, so `.env.example` and the AGENTS §21 table are
  unchanged.
- `package.json` — Next 16.3.4, React 19.2.8, TS ^5, Clerk ^7.9.1. **No
  Supabase dependency yet.**
- `tsconfig.json` — `strict: true`, `@/*` alias to the repo root.
- `next.config.ts` — empty config; **no `images.remotePatterns`**, so
  `next/image` currently only serves the local placeholder.
- `proxy.ts` — `clerkMiddleware()` only; resources guard themselves.
- `app/page.tsx` — `TOP_NEWS.map` → `NewsCard`.
- `app/news/[slug]/page.tsx` — `auth.protect()` then `getArticleDetail(slug)`;
  renders category/location, author, hero caption + credit, Bias Distribution,
  body paragraphs, Related Stories, `AnalysisPanel`, `NewsletterBand`.
- `components/news-card.tsx` — needs `category`, `location`, `imageAlt`,
  `bias`, `sourceCount`.
- `components/analysis-panel.tsx` — `BiasAnalysisCard` ("Based on N balanced
  sources"), `AiSummaryCard` (`summaryBullets`, `summaryGeneratedLabel`,
  `summaryReadTimeLabel`), and `SourceBreakdownCard` (`sourceCounts`,
  `topSources`).
- `components/related-story-card.tsx`, `components/bias-breakdown-row.tsx` —
  import types from `lib/mock/article`.
- `components/site-header.tsx` — imports `CATEGORIES`, `NAV_LINKS`,
  `TODAY_LABEL` from `lib/mock/home`; these are site chrome, not article data.
- `app/design-system/page.tsx` — does **not** import `lib/mock`.
- No `supabase/` directory, no Supabase CLI project, and no Supabase MCP server
  in this session — so the schema is applied by pasting `supabase/schema.sql`
  into the Dashboard → SQL Editor, exactly as AGENTS §7 prescribes.

## Decisions / assumptions

Answers you gave: article URLs use the **article id**; **rewire the pages
now**; **`schema.sql` + Dashboard** (no Supabase CLI migrations); scheduler
gets its **tables now, query functions later**.

1. **Service-role only, no Data API exposure.** Auth is Clerk, not Supabase
   Auth (§6), so no request ever carries a Supabase user JWT. Every read and
   write goes through the server with the service-role key. Therefore RLS is
   enabled on all six tables with **no policies** (deny-all for `anon` /
   `authenticated`) plus explicit `revoke all ... from anon, authenticated`.
   The service role bypasses RLS. No browser Supabase client is created.
2. **`lib/supabase/service.ts` is `import "server-only"`** — a build-time error
   is the guardrail for AGENTS §21, not a code-review convention.
   `server-only` ships with Next.js; no new dependency.
3. **Hand-written types.** No CLI/MCP access here, so `lib/supabase/types.ts`
   is a hand-written `Database` type (`Row` / `Insert` / `Update` per table),
   kept in sync with `schema.sql` by hand per AGENTS §7.
4. **UUID primary keys** via `gen_random_uuid()` for the five entity tables;
   `logs` uses `bigint generated always as identity` (append-only, high volume).
5. **Dedupe (§10)** — `articles.url` is `not null unique`; `canonical_url` gets
   a partial unique index (`where canonical_url is not null`). Inserts upsert
   on `url` with `ignoreDuplicates: true` — a duplicate is skipped, never
   overwritten. Append-only.
6. **Oxylabs IDs are `text`, never numeric** (§18: 64-bit IDs exceed
   `Number.MAX_SAFE_INTEGER`), enforced at the database.
7. **`article_analyses.article_id` is `unique`** — one analysis per article,
   which also makes the §19 LEFT JOIN pending check unambiguous.
8. **Pending-analysis check (§19.1)** uses a supabase-js embedded select
   (`article_analyses(article_id)`) filtered in JS for a missing embed — never
   `.eq('article_analyses.…')` (§21 gotcha), never `analyzed_at is null` alone.
9. **URL existence check (§9)** chunks at **15** URLs per `.in()`, with the
   size in `lib/supabase/limits.ts` alongside the other centralized limits.
10. **Routing by `id`** — no `slug` column (not in §7). `/news/[slug]` keeps
    its folder name; the segment value is the article UUID and the page calls
    `getArticleById`.
11. **Scheduler queries deferred** — `oxylabs_schedules` and
    `oxylabs_schedule_runs` are created in `schema.sql`, typed in `types.ts`,
    but get **no** query module here; that lands with the §18 task which knows
    the real Oxylabs response shapes.
12. **pgvector deferred** — no `vector` column, no ivfflat index, no
    `getRelatedArticles`; those arrive in the §20 task.
13. **Seed data lives in its own file.** `supabase/seed.sql` seeds the five
    outlets AGENTS §11 already names in its URL-rejection examples — BBC News,
    Reuters, NPR, Fox News, The Guardian — as **active** sources, homepage
    entry URLs only (§9). It is insert-only and idempotent
    (`on conflict (listing_url) do nothing`), so re-running never reverts a
    change you made in the Dashboard, such as flipping `is_active` off.
    `parser_strategy` is set to a short slug per source (`bbc`, `reuters`,
    `npr`, `fox`, `guardian`) for the §11 source-specific extractors to
    dispatch on; nothing reads it in this task. `schema.sql` contains no seed
    data — DDL and data stay in separate files.
14. **Dependency**: `npm install --save-exact @supabase/supabase-js@2.115.0`
    (exact pin + committed lockfile per the Supabase skill).

### The UI field gap — what the database does not have

The mock modules carry fields the §7 schema does not store. AGENTS §5 says the
UI displays **stored** data only, so rather than inventing values the affected
UI is trimmed. Every removal below is a field with no column behind it:

| Mock field | Resolution |
| --- | --- |
| `category`, `location` | **Dropped.** No column in §7. The caption line becomes the **source name**. |
| `author`, `imageCaption`, `imageCredit` | **Dropped** from the details page. Not stored. |
| `imageAlt` | Falls back to the article title. |
| `sourceCount`, `sourceCounts`, `topSources` | **Dropped**, and the whole **Source Breakdown card is removed**. skew stores one source per article; there is no multi-source aggregation to report. "Based on N balanced sources" becomes the source name plus a link to the original article. |
| `summaryBullets` | `article_analyses.summary` is one text field. Split on blank lines / newlines: multiple lines render as the existing bullet list, a single line renders as a paragraph. |
| `paragraphs` | Split `articles.raw_text` on blank lines, filtering empties. |
| `related` | **Section removed** until §20 ships `getRelatedArticles`. `related-story-card.tsx` is kept (retargeted at the new view types) for that task. |
| `readTimeLabel`, `summaryReadTimeLabel` | **Derived** from the stored text at ~200 wpm — computed from stored data, not invented. |
| `publishedLabel`, `summaryGeneratedLabel` | Formatted from `published_at` / `article_analyses.created_at`: relative ("2h ago") under 24h, absolute date beyond. |
| `CATEGORIES`, `NAV_LINKS`, `TODAY_LABEL` | Site chrome, not article data. Moved to `lib/site-nav.ts`; `TODAY_LABEL` becomes a function of the current date. |

If you would rather keep the Source Breakdown card and the category/location
lines, that needs new columns in §7 — say so and I will amend AGENTS.md first
rather than fabricate the values.

15. **Remote images.** Article `image_url` values point at arbitrary news CDNs,
    so `next.config.ts` gains
    `images: { remotePatterns: [{ protocol: "https", hostname: "**" }] }`.
    This is the permissive setting — it lets any HTTPS host be optimized
    through the app's image endpoint. Narrowing it to the hostnames of your
    seeded sources is the safer end state once those sources exist; flagging
    it rather than silently shipping the wide pattern.
16. **Freshness** — both pages `export const dynamic = "force-dynamic"` so
    service-role reads are never statically cached at build time (there is no
    data at build time).

## Files likely to change

**New**
- `supabase/schema.sql` — canonical DDL.
- `supabase/seed.sql` — the five §11 sources, insert-only and idempotent.
- `lib/supabase/types.ts`, `env.ts`, `limits.ts`, `service.ts`.
- `lib/supabase/queries/sources.ts`, `articles.ts`, `analyses.ts`, `logs.ts`.
- `lib/view/articles.ts` — presentation types (`ArticleCardView`,
  `ArticleDetailView`, `BiasTone`, `BiasLabel`), `biasHeadline`, and the
  row → view mappers plus the date/read-time formatters.
- `lib/site-nav.ts` — `CATEGORIES`, `NAV_LINKS`, `todayLabel()`.

**Modified**
- `package.json` / `package-lock.json` — add `@supabase/supabase-js` (exact).
- `next.config.ts` — `images.remotePatterns`.
- `app/page.tsx` — `getAnalyzedArticles()` + empty state.
- `app/news/[slug]/page.tsx` — `getArticleById()`, trimmed header/hero,
  Related Stories section removed.
- `components/news-card.tsx`, `analysis-panel.tsx`, `bias-breakdown-row.tsx`,
  `related-story-card.tsx`, `site-header.tsx` — retargeted at `lib/view` /
  `lib/site-nav`.

**Deleted**
- `lib/mock/home.ts`, `lib/mock/article.ts`.

**Untouched**: `.env.example`, `AGENTS.md`, `proxy.ts`,
`app/design-system/page.tsx`, `components/{article-card,category-chip,
bias-meter,icon,newsletter-band,site-footer,social-icons,wordmark}.tsx`.

## Implementation requirements

### `supabase/schema.sql`

Idempotent (`create table if not exists`, `create index if not exists`), safe
to re-run, ordered: extensions → trigger fn → tables → indexes → RLS/grants.
No seed data — that lives in `supabase/seed.sql`.

**`sources`** — `id uuid pk default gen_random_uuid()`, `name text not null`,
`listing_url text not null unique`, `parser_strategy text`, `logo_url text`,
`is_active boolean not null default true`, `created_at` / `updated_at
timestamptz not null default now()`.

**`articles`** — `id uuid pk`, `source_id uuid not null references sources(id)
on delete cascade`, `url text not null unique`, `canonical_url text`,
`title text not null`, `image_url text not null`,
`published_at timestamptz not null`, `raw_text text not null`,
`scraped_at timestamptz not null default now()`, `analyzed_at timestamptz`,
`created_at timestamptz not null default now()`. `image_url` and
`published_at` are `not null` — the article content gate (§9, §13) enforced by
the database, not only by application code.

**`article_analyses`** — `id uuid pk`, `article_id uuid not null unique
references articles(id) on delete cascade`, `summary text not null`,
`sentiment_score numeric not null check (-1..1)`,
`sentiment_label text not null check (in ('positive','neutral','negative'))`,
`bias_score numeric not null check (-1..1)`,
`bias_label text not null check (in ('left','center','right','mixed',
'unclear'))`, `left_percentage` / `center_percentage` / `right_percentage
integer not null check (0..100)` plus a table-level
`check (left + center + right = 100)`,
`confidence numeric not null check (0..1)`, `framing_notes text`,
`loaded_terms text[] not null default '{}'`, `disclaimer text`,
`model text not null`, `created_at timestamptz not null default now()`.
A comment marks where §20 adds `embedding vector(1536)`.

**`logs`** — `id bigint generated always as identity pk`, `created_at`,
`level text not null check (in ('debug','info','warn','error'))`,
`event text not null`, `message text`, `context jsonb`,
`source_id uuid references sources(id) on delete set null`,
`article_id uuid references articles(id) on delete set null`.

**`oxylabs_schedules`** — `id uuid pk`, `source_id uuid not null unique
references sources(id) on delete cascade`, `schedule_id text not null unique`
(**text**, §18), `cron_expression text not null`,
`is_active boolean not null default true`, `created_at` / `updated_at`.

**`oxylabs_schedule_runs`** — `id uuid pk`, `schedule_id text not null
references oxylabs_schedules(schedule_id) on delete cascade`,
`job_id text not null unique` (**text**), `result_status text`,
`run_at timestamptz`, `processed_at timestamptz`, `created_at`.

**Indexes** — `articles(source_id)`, `articles(published_at desc)`,
`articles(scraped_at desc)`, partial `articles(id) where analyzed_at is null`,
partial unique `articles(canonical_url) where canonical_url is not null`,
partial `sources(is_active) where is_active`, `logs(created_at desc)`,
`logs(article_id)`, `oxylabs_schedule_runs(schedule_id)`, partial
`oxylabs_schedule_runs(job_id) where processed_at is null`.

**`updated_at` trigger** — one `public.set_updated_at()`, `language plpgsql`,
**`security invoker`**, `set search_path = ''`; triggers on `sources` and
`oxylabs_schedules`. No `SECURITY DEFINER` anywhere.

**RLS + grants** — `enable row level security` on all six tables, **no
policies**, `revoke all on <table> from anon, authenticated;`. A header comment
explains the service role is the only accessor.

### `supabase/seed.sql`

```sql
insert into sources (name, listing_url, parser_strategy, is_active)
values
  ('BBC News',     'https://www.bbc.com/news',       'bbc',      true),
  ('Reuters',      'https://www.reuters.com',        'reuters',  true),
  ('NPR',          'https://www.npr.org',            'npr',      true),
  ('Fox News',     'https://www.foxnews.com',        'fox',      true),
  ('The Guardian', 'https://www.theguardian.com/us', 'guardian', true)
on conflict (listing_url) do nothing;
```

Homepage entry URLs only — never a section, category, or topic path (§9, §11).
A header comment states that editing `is_active` in the Dashboard is safe
because re-running this file will not overwrite it.

### `lib/supabase/`

- `env.ts` — `requireEnv(name)` throwing
  `Missing required environment variable: X`; exports `supabaseUrl()` and
  `serviceRoleKey()`.
- `limits.ts` — `URL_EXISTENCE_CHUNK_SIZE = 15`,
  `DEFAULT_ARTICLE_PAGE_SIZE = 24`, `analysisBatchSize()` reading
  `ANALYSIS_BATCH_SIZE` (default 5, §21).
- `types.ts` — `Database` interface mirroring the DDL exactly, plus aliases
  `SourceRow`, `ArticleRow`, `ArticleInsert`, `ArticleAnalysisRow`,
  `ArticleAnalysisInsert`, `LogRow`, `LogInsert`, `OxylabsScheduleRow`,
  `OxylabsScheduleRunRow`, and the unions `SentimentLabel`, `BiasLabel`,
  `LogLevel`.
- `service.ts` — `import "server-only"`, module-memoized
  `createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false,
  autoRefreshToken: false } })` exported as `getServiceClient()`, with a
  comment stating it must never be imported from a client component.

### `lib/supabase/queries/*`

Each module is `import "server-only"`, uses `getServiceClient()`, throws a
descriptive `Error` on `error`, returns typed rows. Small functions, explicit
return types, no `any`.

- `sources.ts` — `getActiveSources()`, `getSourceById(id)`,
  `getSourcesByIds(ids)`.
- `articles.ts` —
  - `findExistingUrls(urls)` → `Promise<Set<string>>`; dedupes input, chunks by
    15, checks `url` and `canonical_url`.
  - `insertArticles(rows)` → only the rows actually inserted (append-only
    upsert on `url`, `ignoreDuplicates: true`).
  - `getAnalyzedArticles({ limit, offset })` — articles joined to `sources` and
    `article_analyses`, newest `published_at` first, analysis row required.
  - `getArticleById(id)` — same join, single row or `null`.
  - `getArticlesPendingAnalysis(limit)` — §19.1 embedded-select LEFT JOIN check
    filtered in JS, oldest `scraped_at` first.
  - `markArticleAnalyzed(id, analyzedAt)` — called only after the analysis row
    is saved (§19.6).
- `analyses.ts` — `insertAnalysis(row)` upserting on `article_id`;
  `getAnalysisByArticleId(articleId)`.
- `logs.ts` — `writeLog(entry)` which **never throws** (a failed log must not
  break a pipeline run; it falls back to `console.error`), and
  `getRecentLogs({ limit })`.

### `lib/view/articles.ts`

Pure mapping, no supabase-js import beyond row types, so components stay free
of database shapes:

- `ArticleCardView` — `id`, `title`, `sourceName`, `imageUrl`,
  `publishedLabel`, `bias`, `biasLabel`.
- `ArticleDetailView` — the card fields plus `originalUrl`, `paragraphs`,
  `readTimeLabel`, `summaryLines`, `summaryGeneratedLabel`,
  `summaryReadTimeLabel`, `sentimentLabel`, `confidence`, `framingNotes`,
  `loadedTerms`, `disclaimer`.
- `toCardView(row)` / `toDetailView(row)`, `biasHeadline(bias, label)` (moved
  from `lib/mock/article.ts` unchanged), `formatPublished(date)`,
  `readTimeLabel(text)`, `splitParagraphs(text)`.
- `disclaimer` falls back to `"AI summaries can make mistakes."` when the
  column is null.

### Pages and components

- `app/page.tsx` — `getAnalyzedArticles({ limit: DEFAULT_ARTICLE_PAGE_SIZE })`
  → `toCardView` → the existing grid. Zero rows renders "No analyzed articles
  yet." in the existing caption style, not an empty grid.
- `app/news/[slug]/page.tsx` — keeps `await auth.protect()` **before** the
  query. `getArticleById(slug)`; `notFound()` when missing or unanalyzed.
  Caption line becomes `sourceName`; the meta row keeps published + read time
  and the Save/Share/More buttons; hero loses caption/credit; the Bias
  Distribution card's "N sources" line becomes a link to the original article;
  the Related Stories section is removed; `AnalysisPanel` and `NewsletterBand`
  stay.
- `components/analysis-panel.tsx` — `SourceBreakdownCard` deleted;
  `BiasAnalysisCard`'s sub-line becomes the source name; `AiSummaryCard`
  renders `summaryLines` (list when >1, paragraph when 1).
- `components/news-card.tsx` — `ArticleCardView`; caption = `sourceName`,
  footer line = `publishedLabel`; the info button's `aria-label` keeps the
  percentages.
- `components/bias-breakdown-row.tsx`, `related-story-card.tsx` — import types
  from `lib/view/articles`; `related-story-card.tsx` otherwise unchanged and
  currently unrendered (kept for §20).
- `components/site-header.tsx` — imports from `lib/site-nav`.

## Security requirements

- `SUPABASE_SERVICE_ROLE_KEY` is read only inside `lib/supabase/service.ts`,
  which is `import "server-only"`. No `NEXT_PUBLIC_` prefix, never imported by
  a client component, never returned from a query function.
- No Supabase browser client; no grants to `anon` / `authenticated`; RLS on all
  six tables with zero policies.
- Trigger function is `security invoker` with `set search_path = ''`.
- Query errors surface as messages only — no key, URL, or raw PostgREST payload.
- `auth.protect()` still runs before any data fetch on the details page.
- `@supabase/supabase-js` pinned exactly, lockfile committed.
- `images.remotePatterns` is deliberately permissive; called out in decision 15.

## Acceptance criteria

1. `supabase/schema.sql` creates all six tables with the constraints, indexes,
   triggers, RLS, and revokes above, and is safe to run twice.
2. `lib/supabase/types.ts` matches the DDL field-for-field.
3. Nothing under `app/**` or `components/**` imports `lib/supabase/service.ts`
   or a query module from a client component; the build enforces it.
4. `findExistingUrls` never sends more than 15 URLs in one `.in()`.
5. `getArticlesPendingAnalysis` uses the embedded-select + JS filter, not
   `analyzed_at`, and not a joined-table `.eq`.
6. `lib/mock/` is gone and nothing references it.
7. Both pages render without a database row present: home shows the empty
   state, an unknown/unanalyzed id 404s, and the details page still redirects
   signed-out visitors to sign-in.
8. No `any`. `npm run typecheck`, `npm run lint`, and `npm run build` pass.
9. `supabase/seed.sql` inserts the five sources, is safe to run repeatedly,
   and never overwrites an `is_active` change made in the Dashboard.
10. `.env.example`, `AGENTS.md`, and `proxy.ts` unchanged.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`

Exact output reported, per AGENTS §22.

## Manual test steps expected after implementation

1. **Apply the schema** — Supabase Dashboard → SQL Editor → paste all of
   `supabase/schema.sql` → Run. Expect success; re-run once to confirm
   idempotency.
2. **Verify tables + RLS**:
   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
   order by tablename;
   ```
   Expect the six tables, all `rowsecurity = true`.
3. **Seed the sources** — SQL Editor → paste `supabase/seed.sql` → Run, then:
   ```sql
   select name, listing_url, parser_strategy, is_active
   from sources order by name;
   ```
   Expect the five rows, all active. Re-run `seed.sql` once and confirm the
   count stays at five. To prove the insert-only choice: flip one source with
   `update sources set is_active = false where name = 'Fox News';`, re-run
   `seed.sql`, and confirm it is still inactive.
4. **Empty-state check** — `npm run dev`, open `http://localhost:3000`. Expect
   "No analyzed articles yet." Open `http://localhost:3000/news/does-not-exist`
   signed out → redirected to sign-in; signed in → 404.
5. **End-to-end check with one hand-inserted row** — in the SQL Editor, insert
   one `articles` row (a real `source_id`, any `url`, an HTTPS `image_url`, a
   `published_at`, some `raw_text`) plus one `article_analyses` row with
   percentages summing to 100, then set `analyzed_at = now()`. Reload the home
   page: the card appears with source name, framing meter, and date. Click
   through to `/news/<article id>` and confirm the analysis panel renders
   summary, sentiment, confidence, framing notes, loaded terms, and disclaimer.
   Delete both rows afterwards.
6. **Confirm the service key stays server-side** — after `npm run build`,
   `grep -r "service_role\|SUPABASE_SERVICE_ROLE_KEY" .next/static/` returns
   nothing.
