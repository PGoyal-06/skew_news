# AI article analysis pipeline (AGENTS §19)

## Goal

Implement the AI analysis layer: `POST /api/analyze` finds every article with no
`article_analyses` row, analyzes each one with the Vercel AI SDK + OpenAI
provider, validates the model output with Zod, saves it to `article_analyses`,
and marks `analyzed_at` only after a valid save. Batched to avoid timeouts,
with per-batch and final console summaries.

Scope is AGENTS §19 only. Embeddings, pgvector, and Related Articles are §20 and
are explicitly **out of scope** here — no `embedding` column, no `embed()` call.
Section 20 is designed to backfill embeddings on a later run without re-running
analysis, so nothing here blocks it.

## Skills read

- `.agents/skills/ai-sdk/SKILL.md` — plus the version-matched bundled docs it
  points at: `node_modules/ai/docs/03-ai-sdk-core/10-generating-structured-data.mdx`,
  `30-embeddings.mdx`, and `node_modules/@ai-sdk/openai/docs/03-openai.mdx`.
- `.agents/skills/supabase/SKILL.md` — service-role-only access, RLS posture,
  the joined-table filter gotcha.

### What the docs changed versus memory

- Installed `ai` is **7.0.93**, which is also the latest on npm.
- **`generateObject` is deprecated in v7.** `node_modules/ai/dist/index.d.ts`
  marks it `@deprecated Use generateText with an output setting instead`. The
  current API is `generateText({ model, output: Output.object({ schema }) })`,
  which returns `{ output }`. Do not write `generateObject`.
- OpenAI provider model IDs are current-generation: `gpt-5`, `gpt-5-mini`,
  `gpt-5-nano`, `gpt-5.4`, `gpt-6-astra`, etc. All support object generation
  except `gpt-5-chat-latest`. Do not use a remembered model ID.
- Embeddings (for §20 later) use `openai.embedding('text-embedding-3-small')`,
  1536 dimensions — which matches the `vector(1536)` column §20 specifies.

## Existing code inspected

- `lib/pipeline/scrape.ts` — the run-summary + logger shape to mirror: a
  `runId`, a `logger()` helper that writes to both `console` and the `logs`
  table, injectable `Dependencies` for testing, and a typed summary object.
- `lib/supabase/queries/articles.ts` — `getArticlesPendingAnalysis(limit)` and
  `markArticleAnalyzed(id)` already exist. The pending check already LEFT JOINs
  `article_analyses` and filters in JS, exactly as §19.1 and the §21 joined-filter
  gotcha require.
- `lib/supabase/queries/analyses.ts` — `insertAnalysis(row)` already exists and
  upserts on `article_id`.
- `lib/supabase/queries/logs.ts` — `writeLog` never throws.
- `lib/supabase/limits.ts` — `analysisBatchSize()` already reads
  `ANALYSIS_BATCH_SIZE` with a default of 5.
- `lib/security/admin.ts` — `isAdminRequest` (timing-safe).
- `app/api/scrape/route.ts` — the route-handler shape to mirror: admin check,
  body-size cap, JSON parse guard, Zod input parse, typed summary response.
- `lib/supabase/types.ts` + `supabase/schema.sql` — `article_analyses` already
  has every §19 column, a CHECK that the three percentages sum to 100, and a
  unique `article_id`.
- `lib/view/articles.ts` and the news UI already read every analysis field.

**Consequence: no schema change and no new Supabase migration are needed.**
`supabase/schema.sql` and `lib/supabase/types.ts` stay untouched.

## Decisions and assumptions

1. **Model:** `gpt-5-mini` via `@ai-sdk/openai`, held as one exported constant
   in `lib/ai/config.ts` and saved to `article_analyses.model`. No new env var —
   the AGENTS §21 env table is canonical and adding a var means editing that
   table and `.env.example`; a centralized constant is simpler and matches
   "centralized limits".
2. **Structured output:** `generateText` + `Output.object()` with a Zod schema,
   per the v7 docs above.
3. **`bias_score` is derived, never asked for.** The model returns only the
   three percentages; the code computes `(right − left) / 100` (§19).
4. **Percentage sum:** the model is asked for integers summing to 100, and the
   Zod schema enforces it with a `.refine`. If the model is off by a rounding
   point, that is a validation failure → one retry. No silent normalization,
   because the DB CHECK would reject a bad row anyway and silent fixing hides
   model drift.
5. **Retry policy (§19):** exactly one retry on invalid or failed output. A
   second failure marks the article failed for this run, saves nothing, and
   leaves `analyzed_at` untouched so the next run picks it up again.
6. **Batching:** sequential batches of `analysisBatchSize()`. Articles inside a
   batch run concurrently; batches run in series. Batching exists only to avoid
   timeouts (§19), so the run continues until no pending articles remain unless
   the caller passed a `limit`.
7. **Input truncation:** `raw_text` is capped at a fixed character limit before
   being sent to the model, to bound cost and latency on very long articles.
8. **Deadline:** a run deadline mirroring `SCRAPE_LIMITS.runTimeoutMs` so the
   route returns a `partial` summary instead of being killed mid-batch by the
   platform.
9. **Failures are counted, never thrown.** One article's failure must not abort
   the run.
10. **Dependencies were installed** to read the version-matched docs:
    `ai@7.0.93` and `@ai-sdk/openai`. Both are already in `package.json`.

## Files likely to change

New:

- `lib/ai/config.ts` — model constant, input character cap, retry count.
- `lib/ai/analysis.ts` — Zod output schema, prompt, `analyzeArticle()`; the only
  module that talks to the model.
- `lib/pipeline/analyze.ts` — `analyzeInput` Zod schema, `runAnalysis()`
  orchestration, batching, logging, typed summary.
- `app/api/analyze/route.ts` — thin `POST` handler.

Modified:

- `package.json` / `package-lock.json` — the two new dependencies.

Untouched: `supabase/schema.sql`, `lib/supabase/types.ts`, `.env.example`, all UI.

## Implementation requirements

### `lib/ai/config.ts`

- `ANALYSIS_MODEL = "gpt-5-mini"`.
- `MAX_ARTICLE_CHARS` — cap on `raw_text` sent to the model.
- `ANALYSIS_ATTEMPTS = 2` (initial + one retry, §19).

### `lib/ai/analysis.ts`

- `import "server-only"` — the OpenAI key must never reach browser code (§21).
- Zod schema (`analysisOutput`) with exactly these model-produced fields:
  `summary` (non-empty), `sentimentScore` (−1..1), `sentimentLabel`
  (`positive|neutral|negative`), `politicalFramingLabel`
  (`left|center|right|mixed|unclear`), `leftPercentage` / `centerPercentage` /
  `rightPercentage` (integers 0..100), `confidence` (0..1), `framingNotes`,
  `loadedTerms` (string array), `disclaimer`. A `.refine` asserts the three
  percentages sum to exactly 100.
- No `biasScore` field — it is derived by the caller.
- A system prompt that states the §19 framing rules: judge from the article text
  only and never from the source's name or reputation; percentages are integers
  summing to 100; the label matches the strongest percentage unless confidence
  is low or the percentages are close; weak evidence means `unclear` with low
  confidence; the summary must be neutral; output is an AI estimate, not fact.
- The user message carries the article title, source name, and truncated
  `raw_text`.
- `analyzeArticle(article, sourceName)` calls `generateText` with
  `output: Output.object({ schema: analysisOutput })`, returns the parsed object
  plus the model name. Retries once on throw or validation failure. Errors are
  returned as a typed failure result, not thrown.

### `lib/pipeline/analyze.ts`

- `import "server-only"`.
- `analyzeInput` Zod schema, `.strict()`: optional `articleIds` (array of UUIDs)
  and optional `limit` (positive int). Both absent = analyze all pending (§19).
- `runAnalysis(options)`:
  1. Resolve the work set. No `articleIds` → `getArticlesPendingAnalysis`,
     bounded by `limit` when given, otherwise unbounded. With `articleIds` →
     load those articles and skip any that already have an analysis row.
  2. Loop batches of `analysisBatchSize()` until the work set is exhausted or
     the deadline passes.
  3. Per article: call `analyzeArticle`; on valid output compute
     `bias_score = (right − left) / 100`, `insertAnalysis(...)`, then
     `markArticleAnalyzed(...)` — in that order, so `analyzed_at` is set only
     after a valid save (§19.6).
  4. Count `analyzed`, `skipped`, `failed`, with failure reasons grouped by
     count.
  5. Log per batch and a final summary object, using the same
     console-plus-`logs`-table logger pattern as `lib/pipeline/scrape.ts` with
     an `analysis.` event prefix.
- Exported `AnalysisSummary` type: `runId`, `status`
  (`completed | partial | failed`), `pendingFound`, `analyzed`, `skipped`,
  `failed`, `batches`, `durationMs`, `failureReasons`, and a per-article result
  list (`articleId`, `title`, `status`, `reason?`).
- Injectable `Dependencies` like `scrape.ts`, so the pipeline is testable
  without hitting OpenAI or Supabase.

### `app/api/analyze/route.ts`

- `POST` only (§14). `runtime = "nodejs"`, `maxDuration = 300`.
- `isAdminRequest` first; missing or wrong secret → `401` (§15).
- Body size cap, JSON parse guard, `analyzeInput.safeParse`, `400` with field
  details on bad input — mirroring the scrape route.
- Returns the summary; `500` when `status === "failed"`.
- Never echo the admin secret, the OpenAI key, or a raw model error to the
  client; log details server-side instead.

## Security requirements

- `lib/ai/*` and `lib/pipeline/analyze.ts` are `server-only`; no model call can
  originate in browser code (§21).
- `OPENAI_API_KEY` is read only by the OpenAI provider on the server and never
  logged, never returned in a response, never prefixed `NEXT_PUBLIC_`.
- `POST /api/analyze` requires `x-biasly-admin-secret`; the secret is never
  accepted in the query string.
- Database access stays on the service-role client behind
  `lib/supabase/queries/*`.
- Error responses are generic; model and database error text goes to the server
  console only.

## Acceptance criteria

1. `POST /api/analyze` without the admin header returns `401`.
2. With the header and an empty body, every article lacking an
   `article_analyses` row is analyzed — not a fixed 10, not the latest scrape
   only (§19).
3. `{"limit": 2}` analyzes at most 2; `{"articleIds": [...]}` analyzes just
   those.
4. Every saved row has all §19 fields, `bias_score === (right − left) / 100`,
   percentages summing to 100, and `model` set.
5. `analyzed_at` is set only for articles whose analysis actually saved.
6. Invalid model output is retried once, then counted as failed with nothing
   saved and `analyzed_at` left null.
7. Re-running immediately reports 0 pending and analyzes nothing.
8. Deleting an `article_analyses` row while `analyzed_at` is still set makes
   that article pending again on the next run (§19.1).
9. The dev-server terminal shows per-batch progress and one final summary
   object; the same events land in the `logs` table.
10. Newly analyzed articles appear on the home page and their details page
    renders summary, sentiment, percentages, confidence, framing notes, loaded
    terms, and disclaimer — with no UI change.
11. `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (a new route and new server modules are added)

## Manual test steps

Start the dev server and watch its terminal — analysis progress is logged there
(§17):

```bash
npm run dev
```

Analyze everything pending:

```bash
curl -sS -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -d '{}' | jq
```

Analyze a bounded batch:

```bash
curl -sS -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -d '{"limit": 2}' | jq
```

Analyze specific articles:

```bash
curl -sS -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -d '{"articleIds": ["<uuid>"]}' | jq
```

Confirm the auth gate returns 401:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" -d '{}'
```

Then open `http://localhost:3000`, confirm the newly analyzed articles appear as
cards with sentiment, framing label, and percentages, and open one to confirm the
details page renders the full analysis.
