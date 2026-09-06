# Prompt — Oxylabs Scheduler + Vercel Cron (AGENTS §18)

## Goal

Deliver the complete hourly automation described in AGENTS §18, all parts together:

1. **Sync schedules route** — one Oxylabs schedule per active source, plus orphan deactivation.
2. **List schedules route** — reads stored `oxylabs_schedules` rows.
3. **Runs route** — reads stored `oxylabs_schedule_runs` rows.
4. **Manual process route** — on-demand processing of completed scheduled results.
5. **Vercel Cron config** — `vercel.json`, `/api/cron/pipeline` at `15 * * * *`.
6. **Cron pipeline route** — scheduled-result processing, then AI analysis, in sequence.

Scheduler processing must reuse the existing scrape-to-insert pipeline, not duplicate it.

## Skills read

- `.agents/skills/web-scraper-api/SKILL.md` — auth (Basic, `OXY_WSA_USERNAME`/`OXY_WSA_PASSWORD`), `data.oxylabs.io` Push-Pull base, `universal` source, response shape.
- `.agents/skills/supabase/SKILL.md` — service-role-only access, RLS with zero policies, no `.eq('foreignTable.col')` filters, verify after changing.
- Live Oxylabs Scheduler docs (fetched per §18, `https://developers.oxylabs.io/products/web-scraper-api/features/scheduler`):
  - `POST   https://data.oxylabs.io/v1/schedules` — body `{ cron, items[], end_time }`; response `schedule_id`, `active`, `items_count`, `cron`, `end_time`, `next_run_at`.
  - `GET    /v1/schedules` — `{ schedules: [ids] }`.
  - `GET    /v1/schedules/{id}/runs` — `{ runs: [{ run_id, success_rate, jobs: [{ id, create_status_code, result_status, created_at, result_created_at }] }] }`.
  - `PUT    /v1/schedules/{id}/state` — body `{ "active": false }`, 202 empty body.
  - `GET    /v1/queries/{job_id}/results` — `{ results: [{ content, url, status_code, ... }] }`. (`/v1/schedules/{id}/jobs` is deliberately unused: no status field.)
  - No delete endpoint exists — deactivate via `/state`.

## Existing code inspected

- `lib/oxylabs/client.ts` — realtime `universal` fetch, `ScrapeError`, streaming size cap, and the existing precision trick: numeric `id`/`job_id`/`schedule_id` fields are string-quoted in the **raw text** before `JSON.parse`. Reuse that exact approach for scheduler IDs (§18 large-integer rule).
- `lib/pipeline/scrape.ts` — `processSourceHomepage(source, page, limit, result, log, deps, deadline)` is already factored out as the shared homepage-to-insert path. Scheduler processing calls it with HTML from a job result instead of a live fetch.
- `lib/pipeline/analyze.ts` — `runAnalysis(options)` returns `AnalysisSummary`; used unchanged by the cron route.
- `lib/pipeline/limits.ts`, `lib/supabase/limits.ts` — centralized limits; new scheduler limits go here.
- `lib/security/admin.ts` — `isAdminRequest()` (timing-safe).
- `supabase/schema.sql` + `lib/supabase/types.ts` — `oxylabs_schedules` and `oxylabs_schedule_runs` already exist with TEXT IDs, `processed_at`, unique `job_id`, and the unprocessed index. **No schema change is required.**
- `app/api/scrape/route.ts` — the thin-handler template (auth → body size cap → JSON → Zod → pipeline → status by summary).
- No `vercel.json` exists yet.

## Decisions and assumptions

- **One schedule per active source**, each with exactly one `items` entry (`{ source: "universal", url: <listing_url> }`). This keeps the `schedule_id → source_id` mapping in `oxylabs_schedules` unambiguous, which is how a job's HTML is attributed to a source.
- **Oxylabs cron** `0 * * * *` (top of every hour); **Vercel cron** `15 * * * *` (§18 — 15 minutes later). Oxylabs `end_time` is far-future (`2035-01-01 00:00:00`), since no delete endpoint exists.
- **Sync is idempotent**: a source that already has an active row with a live Oxylabs schedule is left alone; only missing sources get a new schedule. Rows for sources that are no longer active are deactivated.
- **Orphan deactivation** runs on every sync, after creation: `GET /v1/schedules` → any Oxylabs ID not stored as active in `oxylabs_schedules` gets `PUT /state {"active": false}`.
- **Job selection for processing**: for each stored active schedule, read `/runs`, take jobs with `result_status === "done"`, upsert them into `oxylabs_schedule_runs`, and process only those with `processed_at IS NULL`. `processed_at` is set after processing (success or rejection) so a job is never re-processed. Non-`done` jobs are recorded with their status and left unprocessed.
- **Recency bound**: only jobs from the most recent `SCHEDULER_LIMITS.runsPerSchedule` runs and at most `jobsPerRun` unprocessed jobs per schedule are processed per invocation, to stay inside the 300s function budget.
- **Failure isolation**: cron step two (analysis) runs even when step one fails (§18.6).
- **Local dev**: the cron route skips the `CRON_SECRET` check when `process.env.NODE_ENV !== "production"` (§18). `CRON_SECRET` is never added to `.env.local`; `.env.example` already documents it. No new env vars.
- Article limit per scheduled source: `SCRAPE_LIMITS.defaultArticlesPerSource` (5).

## Files likely to change

New:
- `lib/oxylabs/scheduler.ts` — Scheduler/Push-Pull API client (server-only, precision-safe IDs).
- `lib/supabase/queries/schedules.ts` — schedule + run row reads/writes via the service client.
- `lib/pipeline/scheduler.ts` — `syncSchedules()` and `processScheduledResults()`.
- `app/api/oxylabs/schedules/route.ts` — `POST` (sync) + `GET` (list).
- `app/api/oxylabs/runs/route.ts` — `GET`.
- `app/api/oxylabs/scheduled-results/process/route.ts` — `POST`.
- `app/api/cron/pipeline/route.ts` — `GET`.
- `vercel.json` — cron registration.

Modified:
- `lib/pipeline/limits.ts` — add `SCHEDULER_LIMITS`.
- `lib/pipeline/scrape.ts` — export the `Dependencies`/logger pieces needed by the scheduler if they are not already reachable; **no behavioral change to manual scraping**.

Unchanged: `supabase/schema.sql`, `lib/supabase/types.ts`, `.env.example` (all already cover this work).

## Implementation requirements

### `lib/oxylabs/scheduler.ts`
- `server-only`; Basic auth from `OXY_WSA_USERNAME` / `OXY_WSA_PASSWORD`; throws `ScrapeError` codes (reuse the existing class).
- Read every response as **raw text**, string-quote numeric `id` / `job_id` / `schedule_id` / `run_id` fields with a regex, then `JSON.parse` and Zod-validate. IDs are `string` everywhere in TypeScript — never `number`.
- Functions: `createSchedule(url, cron, endTime)`, `listScheduleIds()`, `getScheduleRuns(scheduleId)`, `deactivateSchedule(scheduleId)`, `getJobResultHtml(jobId)`.
- Reuse the streamed size cap (`SCRAPE_LIMITS.maxResponseBytes`) and `AbortSignal.timeout` pattern from `lib/oxylabs/client.ts`.
- `getJobResultHtml` returns `{ html, url }` shaped like `HtmlPage`, validating `status_code === 200`, non-empty content, and an HTML-looking body, so it drops straight into `processSourceHomepage`.

### `lib/pipeline/scheduler.ts`
- `syncSchedules()`: load active sources → for each without a live active schedule row, `createSchedule` and insert the row → deactivate DB rows whose source is no longer active → orphan sweep on Oxylabs → typed summary `{ runId, status, sourcesChecked, created, existing, deactivated, orphansDeactivated, failed, durationMs, schedules[] }`.
- `processScheduledResults()`: for each active stored schedule → `/runs` → record jobs → for each unprocessed `done` job: `getJobResultHtml` → `processSourceHomepage(source, page, limit, result, log, deps, deadline)` → mark `processed_at`. Emits the **same run-logging events and summary shape** as manual scraping (§9): status, sources checked, candidates found/rejected, duplicates skipped, detail pages scraped, articles inserted/rejected/failed, duration, rejection reasons by count — plus `jobsFound` / `jobsProcessed` / `jobsSkipped`.
- Both use the console + `logs`-table logger pattern from `lib/pipeline/scrape.ts`, prefixed `schedule.` / `scheduled-results.`.
- Never insert a homepage as an article — guaranteed by routing all inserts through `processSourceHomepage`.

### Routes
All thin handlers, `runtime = "nodejs"`, `maxDuration = 300`, mirroring `app/api/scrape/route.ts`:
- `POST /api/oxylabs/schedules` — admin secret; returns the sync summary.
- `GET  /api/oxylabs/schedules` — returns stored rows (no secrets).
- `GET  /api/oxylabs/runs` — returns recent stored run rows (`limit` query param, Zod-bounded).
- `POST /api/oxylabs/scheduled-results/process` — admin secret; returns the processing summary.
- `GET  /api/cron/pipeline` — `CRON_SECRET` via `Authorization: Bearer <CRON_SECRET>` (Vercel's convention), timing-safe compare, skipped when not production; runs `processScheduledResults()` then `runAnalysis({})` **always**, returns `{ status, process, analysis }`, logs both steps.

### `vercel.json`
```json
{ "crons": [{ "path": "/api/cron/pipeline", "schedule": "15 * * * *" }] }
```

## Security requirements (§15, §21)

- Oxylabs credentials, service-role key, and both secrets stay server-side; every new module imports `server-only`.
- `POST` routes require `x-biasly-admin-secret` via `isAdminRequest`; missing/invalid → `401`. Secret never in a query string.
- Cron route protected by `CRON_SECRET` only — never `BIASLY_ADMIN_SECRET`; wrong/missing → `401`.
- Error responses carry generic messages; provider and database detail goes to the server console only.
- No `any`; Zod-validate every provider response before use.

## Acceptance criteria

- One Oxylabs schedule exists per active source; re-running sync creates nothing new and reports `existing`.
- Orphaned Oxylabs schedules are deactivated by the sync route.
- Schedule and job IDs round-trip as exact digit strings (verified against the raw HTTP text).
- Only `result_status === "done"` jobs are fetched; a processed job is never processed twice.
- Scheduled processing inserts only valid, deduped, non-homepage articles and produces the §9 summary.
- Cron route runs analysis even when processing fails, and returns 401 in production without the secret.
- `vercel.json` registers `/api/cron/pipeline` at `15 * * * *`.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (new routes and config)
- `npm run test:scrape` (must stay green — manual scraping is untouched)

## Manual test steps

Run `npm run dev` in one terminal and watch it — all scrape/analysis progress is logged there.

```bash
# 1. Create one Oxylabs schedule per active source (one-time)
curl -X POST http://localhost:3000/api/oxylabs/schedules \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"

# 2. List stored schedules
curl http://localhost:3000/api/oxylabs/schedules

# 3. Wait for the top of the hour so Oxylabs runs the jobs, then list recorded runs
curl "http://localhost:3000/api/oxylabs/runs?limit=20"

# 4. Process completed scheduled results on demand
curl -X POST http://localhost:3000/api/oxylabs/scheduled-results/process \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"

# 5. Exercise the full automatic pipeline (secret check is skipped in dev)
curl http://localhost:3000/api/cron/pipeline

# 6. Confirm the 401 path
curl -i -X POST http://localhost:3000/api/oxylabs/scheduled-results/process
```

Then reload `http://localhost:3000` — newly scraped articles appear once step two of the cron has set `analyzed_at`.

In production, Vercel Cron calls `/api/cron/pipeline` at :15 past every hour with `CRON_SECRET` injected automatically; no manual call is needed. Creating the Oxylabs schedules (step 1) and deploying `vercel.json` are the two independent one-time setups (§18).
