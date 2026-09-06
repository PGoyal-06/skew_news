# pgvector and Related Articles (AGENTS §20)

## Goal

Upgrade the analysis pipeline to also generate an OpenAI `text-embedding-3-small`
embedding per article, store it on `article_analyses.embedding` (`vector(1536)`),
and render a Related Articles section on the news details page driven by cosine
similarity — up to 5 stories, hidden when the current article has no embedding.

## Skills read

- `.agents/skills/supabase/SKILL.md` — security checklist (RLS in exposed
  schemas, `SECURITY DEFINER` functions in `public` are callable by every role
  and must be avoided / locked down, explicit grants because new tables are no
  longer auto-exposed), imperative-migration workflow, Postgres extensions.
- `node_modules/@ai-sdk/openai/docs/03-openai.mdx` — `openai.embedding(...)` +
  `embed()` from `ai`; capability table confirms `text-embedding-3-small`
  defaults to **1536** dimensions, matching the schema.

## Existing code inspected

- `supabase/schema.sql` — tables, RLS-with-zero-policies + `service_role` grants,
  index block; already reserves `embedding vector(1536)` for this task.
- `lib/supabase/types.ts` — hand-written `Database` type; `Functions` is
  currently `Record<never, never>`.
- `lib/supabase/service.ts`, `lib/supabase/limits.ts`.
- `lib/supabase/queries/articles.ts` — `FULL_SELECT`, `getArticleById`,
  `getArticlesPendingAnalysis` (LEFT-JOIN-in-JS pending check, §19.1).
- `lib/supabase/queries/analyses.ts` — `insertAnalysis` (upsert on `article_id`).
- `lib/ai/config.ts`, `lib/ai/analysis.ts`, `lib/pipeline/analyze.ts`.
- `lib/view/articles.ts` — `RelatedStoryView` + `toRelatedView` already exist,
  unused. `components/related-story-card.tsx` already exists, unrendered.
- `app/news/[slug]/page.tsx` — has the `{/* Related Stories … §20 */}` placeholder.
- `app/api/analyze/route.ts` — thin POST handler, admin-secret guarded.

## Decisions and assumptions

1. **Extension schema.** `create extension if not exists vector with schema
   extensions;` and every reference fully qualified (`extensions.vector(1536)`,
   `extensions.vector_cosine_ops`). This works regardless of the role's
   `search_path`, which is the usual cause of `type "vector" does not exist`.
2. **Cosine ordering needs SQL.** PostgREST cannot express `ORDER BY embedding
   <=> $1`, so ordering happens in a Postgres function
   `public.match_related_articles(p_article_id uuid, p_embedding
   extensions.vector(1536), p_match_count int)` called with `.rpc(...)`.
   It is `SECURITY INVOKER` (never DEFINER — skill checklist), and `EXECUTE` is
   revoked from `public, anon, authenticated` and granted only to
   `service_role`, because Postgres grants EXECUTE to PUBLIC by default.
3. **Embeddings cross the wire as text.** PostgREST renders/accepts `vector` as
   its literal form (`"[0.1,-0.2,…]"`). `embedding` is therefore typed
   `string | null` in `lib/supabase/types.ts`, with `toVectorLiteral` /
   `parseVectorLiteral` helpers doing the conversion in one place. No `any`.
4. **Vectors are never selected in bulk.** `FULL_SELECT` and the pending scan
   stay embedding-free (1536 floats ≈ 30 KB per row). The details page reads the
   single current embedding through a dedicated `getArticleEmbedding(id)`.
5. **Backfill without re-analysis (§20).** Pending detection is extended: an
   article is pending when it has no `article_analyses` row (**needs analysis**)
   or its row has `embedding IS NULL` (**needs embedding only**). Detection uses
   two cheap `article_analyses` id-only queries (one unfiltered, one
   `.is('embedding', null)`) intersected in JS — no joined-table filter (§21
   gotcha) and no vector transfer. An embedding-only article skips the analysis
   model call entirely and just gets its embedding written.
6. **`analyzed_at` last.** Set only after both the analysis row and the embedding
   are saved (§20). An embedding failure leaves the article pending.
7. **IVFFlat on a small table.** Created as mandated by §20 with `lists = 100`;
   a comment notes it should be rebuilt once the table is well populated, since
   IVFFlat quality depends on data present at build time.
8. **Embedding input** is `title` + cleaned `raw_text`, truncated to
   `MAX_EMBEDDING_CHARS = 20_000` (well inside the model's 8191-token limit).
9. **`toRelatedView`** is retargeted from `ArticleWithRelations` to the minimal
   structural shape the related rows return (article columns + source name), so
   related rows need not carry a full analysis row.

## Files likely to change

| File | Change |
| --- | --- |
| `supabase/schema.sql` | extension, `embedding` column, IVFFlat index, `match_related_articles` function + grants |
| `supabase/migrations/…` *(new, optional)* | not used — this project applies `schema.sql` via the Dashboard |
| `lib/supabase/types.ts` | `embedding` on `article_analyses` Row/Insert/Update; `Functions.match_related_articles` typing |
| `lib/supabase/vector.ts` *(new)* | `toVectorLiteral` / `parseVectorLiteral` |
| `lib/supabase/queries/analyses.ts` | `updateAnalysisEmbedding(articleId, embedding)` |
| `lib/supabase/queries/articles.ts` | `getArticleEmbedding`, `getRelatedArticles(articleId, embedding)`, extended `getArticlesPendingAnalysis` |
| `lib/ai/config.ts` | `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `MAX_EMBEDDING_CHARS` |
| `lib/ai/embedding.ts` *(new)* | `embedArticle()` — `server-only`, typed result, retry once |
| `lib/pipeline/analyze.ts` | embed alongside analyze; embedding-only path; summary counters |
| `lib/view/articles.ts` | `toRelatedView` input shape |
| `components/related-stories.tsx` *(new)* | section wrapper rendering `RelatedStoryCard` |
| `app/news/[slug]/page.tsx` | fetch embedding + related, render the section |

## Implementation requirements

### Database (`supabase/schema.sql`, idempotent)

```sql
create extension if not exists vector with schema extensions;

alter table public.article_analyses
  add column if not exists embedding extensions.vector(1536);

create index if not exists article_analyses_embedding_idx
  on public.article_analyses
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

-- Rows still awaiting an embedding backfill (§20).
create index if not exists article_analyses_embedding_pending_idx
  on public.article_analyses (article_id) where embedding is null;
```

`match_related_articles` returns `article_id, title, image_url, published_at,
raw_text, source_name, similarity`, joins `article_analyses → articles →
sources`, filters `embedding is not null`, `articles.analyzed_at is not null`,
`articles.id <> p_article_id`, orders by `embedding <=> p_embedding`, limits to
`p_match_count`. `language sql stable security invoker set search_path = ''`
(all references schema-qualified). Then:

```sql
revoke all on function public.match_related_articles(uuid, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_related_articles(uuid, extensions.vector, integer)
  to service_role;
```

### Pipeline

- `lib/ai/embedding.ts`: `embedArticle({ title, text })` →
  `{ ok: true; embedding: number[]; model: string } | { ok: false; reason: string }`.
  Uses `embed({ model: openai.embedding(EMBEDDING_MODEL), value })`, retries once
  (reuse the `ANALYSIS_ATTEMPTS` constant), never throws, verifies the returned
  vector length equals `EMBEDDING_DIMENSIONS`.
- `lib/pipeline/analyze.ts`:
  - `PendingArticle` gains `needsAnalysis: boolean`.
  - `analyzeOne`: when `needsAnalysis`, run analysis and embedding concurrently
    (`Promise.all`), save the analysis row, then the embedding, then
    `markArticleAnalyzed`. When only the embedding is missing, skip the analysis
    call, write the embedding, then `markArticleAnalyzed`.
  - Outcome status stays `analyzed | failed`; add `mode: "full" | "embedding"` to
    `ArticleOutcome` and `embedded` / `embeddingBackfilled` counters to
    `AnalysisSummary`; log them per batch and in the final summary (§19.7–9).
  - New failure reasons: `embedding_failed`, `embedding_save_failed`.

### UI

- `getRelatedArticles(articleId, embedding)` (service-role client, `server-only`)
  calls the RPC with `RELATED_ARTICLE_LIMIT = 5` (new constant in
  `lib/supabase/limits.ts`) and maps rows through `toRelatedView`.
- `app/news/[slug]/page.tsx` (server component, already `force-dynamic` and
  behind `auth.protect()`): after `getArticleById`, call `getArticleEmbedding`;
  when non-null, `getRelatedArticles`. Render nothing when the embedding is null
  or the list is empty.
- `components/related-stories.tsx`: `<section>` with an `h2` "Related Stories"
  matching the page's existing heading treatment, placed inside `<article>` where
  the current placeholder comment sits (below the body paragraphs, above the
  newsletter band).

### Visual expectations (details page)

- Section top margin `mt-10`, heading `text-h3 text-text-primary`, a
  `border-t border-border pt-6` rule separating it from the article body.
- List: `mt-4 grid gap-4 sm:grid-cols-2` of `RelatedStoryCard` (unchanged
  component — 72px square thumbnail, 2-line clamped title, `source · date ·
  read time` caption). Single column below `sm`, two columns from `sm` up, so it
  never competes with the 340px analysis rail on `lg`.
- No new colors, fonts, or spacing tokens: everything reuses existing
  `text-*` / `border-border` / `bg-bg-primary` design-system classes.

## Security requirements

- `OPENAI_API_KEY` and the service-role key stay server-side; every new module
  under `lib/` starts with `import "server-only"` (§21).
- No embedding, model call, or RPC is reachable from browser code; the details
  page is a server component.
- RPC is `SECURITY INVOKER`, `search_path = ''`, EXECUTE revoked from
  `public/anon/authenticated`, granted to `service_role` only.
- RLS stays enabled with zero policies; no new grants to `anon`/`authenticated`.
- No new environment variables — `OPENAI_API_KEY` already covers embeddings in
  the §21 table, so `.env.example` is unchanged.

## Acceptance criteria

1. `supabase/schema.sql` applies cleanly twice in a row with no error.
2. `article_analyses.embedding` is `vector(1536)`; IVFFlat cosine index exists.
3. `POST /api/analyze` writes an embedding for every newly analyzed article and
   sets `analyzed_at` only after both writes succeed.
4. An article whose analysis row exists with `embedding IS NULL` is picked up on
   the next run and gets **only** its embedding written — no second model
   analysis call, `article_analyses` values otherwise unchanged.
5. A details page for an article with an embedding shows up to 5 related stories,
   ordered by cosine similarity, never including itself, never including
   unanalyzed articles.
6. A details page for an article without an embedding renders exactly as today.
7. `npm run typecheck`, `npm run lint`, `npm run build` all pass; no `any`.

## Checks to run

```bash
npm run typecheck
npm run lint
npm run build
npm run test:scrape
```

## Manual test steps

1. **Apply the schema** — Supabase Dashboard → SQL Editor → paste all of
   `supabase/schema.sql` → Run. (Or enable `vector` first under Database →
   Extensions; the `create extension` line does it either way.) Verify:
   ```sql
   select column_name, udt_name from information_schema.columns
   where table_name = 'article_analyses' and column_name = 'embedding';
   ```
2. **Start the dev server and watch its terminal** (§17) — analysis and
   embedding progress is logged there:
   ```bash
   npm run dev
   ```
3. **Run analysis + embedding** (replace the secret with `BIASLY_ADMIN_SECRET`):
   ```bash
   curl -X POST http://localhost:3000/api/analyze \
     -H 'content-type: application/json' \
     -H 'x-biasly-admin-secret: YOUR_SECRET' \
     -d '{}'
   ```
   Expect a summary object with `analyzed`, `embedded`, `embeddingBackfilled`,
   `failed`, `batches`, `durationMs`.
4. **Confirm embeddings were stored:**
   ```sql
   select count(*) filter (where embedding is not null) as embedded,
          count(*) filter (where embedding is null)     as missing
   from public.article_analyses;
   ```
5. **Test the backfill path** — clear one embedding, re-run step 3, and confirm
   the log shows an embedding-only outcome and the analysis text is unchanged:
   ```sql
   update public.article_analyses set embedding = null
   where article_id = '<some-article-uuid>';
   ```
6. **Related Articles UI** — sign in, open
   `http://localhost:3000/news/<article-uuid>`, scroll past the article body:
   up to 5 related stories appear, none of them the current article. Clear that
   article's embedding (step 5 SQL) and reload — the section disappears.
