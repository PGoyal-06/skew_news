# Oxylabs manual scraping pipeline

## Goal

Implement the manual scrape-to-insert pipeline from AGENTS.md sections 8–17: load active source homepages from Supabase, fetch HTML using Oxylabs, extract and validate real articles, insert valid new articles, and report progress and results. Keep the shared pipeline reusable by a later Scheduler implementation.

## Approval and scope

This prompt requires user approval before implementation, per AGENTS.md section 2. Re-read this file after approval. Scope is manual scraping, its read endpoints, and reusable pipeline modules. Scheduler, Vercel Cron, AI analysis, embeddings, and UI changes are separate work. Preserve existing uncommitted work.

## Skills and documentation read

- `AGENTS.md`.
- `.agents/skills/web-scraper-api/SKILL.md`, explicitly requested by the user (takes precedence over AGENTS.md's older Oxylabs skill path).
- `.agents/skills/supabase/SKILL.md`.
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- Supabase changelog: https://supabase.com/changelog.md — reviewed recent entries; none require changing the existing source read.
- Oxylabs Universal Source: https://developers.oxylabs.io/scraping-solutions/web-scraper-api/targets/generic-target — verified Realtime URL, Basic authentication, universal source, HTML content, and nested status code.
- Before implementing, consult current Supabase v2 filter/insert documentation and installed package types. The old `/reference/javascript/in` and `/filter.md` documentation paths returned 404; do not mistake that for an application error.
- Read additional relevant local Next.js route/runtime and server-boundary docs before writing code. Consult official Cheerio and Zod documentation when adding those dependencies.

## Existing code inspected

- `package.json`: Next.js 16.3.4, TypeScript, Supabase JS 2.115.0; Cheerio and Zod are not direct dependencies. Existing scripts: typecheck, lint, build, dev, start.
- `lib/supabase/service.ts`, `env.ts`, `types.ts`, `limits.ts`: typed server-only service client, existing table types, 15-URL existence chunk size.
- `lib/supabase/queries/sources.ts`: active-source loading and ID lookup helpers.
- `lib/supabase/queries/articles.ts`: original/canonical existence lookup, append-only insert with original-URL conflict skipping; canonical uniqueness conflicts need careful handling. Current existence helper interpolates a raw PostgREST OR expression.
- `lib/supabase/queries/logs.ts`: best-effort persistent logging and recent-log reads.
- `supabase/schema.sql`: required image/date columns, original URL uniqueness, partial unique canonical index, RLS, and service-role privileges already exist.
- `supabase/seed.sql`: five configured parser strategies.
- `.env.example`: required variable names already documented.
- `proxy.ts`: Clerk attaches auth state; action routes must enforce their own admin header.

## Verified live configuration and decisions

Read-only Supabase query on 2026-09-05 returned these active sources:

| Name | ID | Parser |
| --- | --- | --- |
| BBC News | 97905799-252e-4de3-a178-158991b4884a | bbc |
| Fox News | 96db1f62-aff6-402d-a909-d9093f6e1a3c | fox |
| NPR | d40435b6-4173-43a8-bc1b-dd1260b0dba2 | npr |
| Reuters | 806ae74d-d665-4694-9f2a-7c76931d7f63 | reuters |
| The Guardian | b352587e-ae07-4d69-aabd-5dd432cdf879 | guardian |

These IDs document the inspection; runtime source data must always come from Supabase. Do not embed source entry URLs in implementation code. Stored `/news` and `/us` entry URLs are the configured homepages; do not replace them or explore additional listing endpoints.

The user selected all five active sources, up to one article each for the scraping test. Use `{ "articlesPerSource": 1 }` for live verification. The endpoint default remains up to five valid inserted articles per source as required by AGENTS.md. Re-read live active sources before the approved live test.

Supabase and Oxylabs variables are present. `BIASLY_ADMIN_SECRET` is absent. After approval, generate a strong random value and add it only if still missing from `.env.local`, preserving all existing values and never printing the secret. Do not add `CRON_SECRET`.

No database schema change is expected. Reuse existing constraints and data access. Do not apply unrelated SQL changes or seed/reset data.

## Files likely to change

- `app/api/scrape/route.ts`: thin protected POST handler.
- `app/api/sources/route.ts`: GET active source names/IDs and safe source configuration.
- `app/api/logs/route.ts`: protected GET recent operational logs.
- `lib/security/admin.ts`: reusable server-only admin-header check.
- `lib/oxylabs/client.ts`: server-only HTML fetch and response validation.
- `lib/parsing/` modules: URL normalization, source strategies, homepage extraction, article extraction/cleanup, validation.
- `lib/pipeline/scrape.ts`, supporting limits/types/logging modules: orchestration and summary.
- `lib/supabase/queries/articles.ts`: safe chunked URL filters and canonical-conflict handling if needed.
- `package.json`, `package-lock.json`: pinned Cheerio/Zod and a minimal test runner only if needed.
- Focused parser/pipeline tests and HTML fixtures.
- `.env.local`: missing local admin secret only; never commit it.

Exact module splits may follow existing conventions. Keep functions small and avoid unnecessary abstraction.

## API contract

1. `POST /api/scrape` requires `x-biasly-admin-secret`, checked before parsing input, accessing Supabase, or calling Oxylabs. Missing/incorrect header returns 401; missing server secret must fail closed.
2. Optional JSON body: `{ "sourceIds": ["uuid"], "articlesPerSource": 5 }`. Empty body or `{}` uses defaults. Validate with Zod, reject malformed JSON, unknown fields, empty explicit source lists, invalid UUIDs, and noninteger/out-of-range limits with 400. Centralize a maximum of 20 inserts per source per request.
3. Resolve supplied IDs against active sources. Unknown/inactive IDs return 400 rather than silently scraping a different selection. Reject arbitrary source URLs as input.
4. Execute synchronously and return a typed final summary, without run-ID polling. No active sources is a successful no-op with zero counts.
5. `GET /api/scrape` returns 405 with no work. `GET /api/sources` is read-only and exposes no credentials. `GET /api/logs?limit=50` uses admin-header protection, validates a 1–100 limit, and returns sanitized operational logs.
6. Use Node runtime. Distinguish completed, partially failed, and failed runs in the summary. Return a safe 500 for total operational failure; do not hide source failures behind a success status.

## Implementation requirements

1. Fetch only the stored source entry URL and accepted article detail URLs through `POST https://realtime.oxylabs.io/v1/queries`, Basic authentication, `source: universal`, HTML output. Check HTTP and result status, shape, nonempty content, and returned URL. Bound timeouts and transient retries; do not retry authentication/validation failures. Preserve any used large IDs as strings from raw JSON before parsing, or omit unused IDs completely.
2. Select visible story cards/headline links using source-specific selectors. Exclude hidden markup, navigation, footer, menus, and non-story modules. Cheerio cannot determine computed CSS visibility; filter explicit hidden markers and use story-card structure. Never fall back to collecting every page anchor.
3. Support `bbc`, `fox`, `npr`, `reuters`, and `guardian` strategies using their article URL structures and body containers. Fail conservatively for unsupported strategies or uncertain URLs. Reject every page class in AGENTS.md section 9 before detail fetching; additionally reject BBC sport as directed in section 11.
4. Normalize relative URLs against their actual page URL; strip fragments and known tracking parameters while preserving meaningful query parameters. Check trusted source host relationships, safe HTTP(S), and article-specific URL shape. Block foreign destinations, credentials in URLs, localhost/private-IP targets, and invalid canonicals. Never fetch extracted image URLs.
5. Dedupe normalized candidates in memory, then check both original and canonical stored URLs in chunks of at most 15 values. Prefer two typed `.in()` queries per chunk to unsafe raw OR interpolation. Skip known URLs before paid detail fetches.
6. Extract the article title, canonical URL, image, publication date, and article body from appropriate metadata, article JSON-LD (including graphs), and source-specific DOM. Use `datePublished`, not modification time or current time as a substitute. Resolve metadata URLs safely. A declared invalid canonical is a rejection, not a fallback to acceptance.
7. Remove scripts/styles, ads, sponsor/promotional modules, subscriptions, newsletters, related/most-viewed content, bios, captions, sharing text, repeated navigation, JS errors, and CSS dumps. Parse structured metadata before deleting script nodes. Never use the whole page body as an article fallback.
8. Enforce one clear article subject and meaningful body with either three meaningful paragraphs or at least 900 cleaned meaningful characters. Split a single large paragraph using DOM blocks or sentence boundaries; do not reject solely for paragraph count. Reject generic titles, headline collections, image/date omissions, and invalid page types. Never fabricate required fields or substitute a placeholder image.
9. Continue through candidates until the requested number of valid new inserts is reached or candidates/bounded detail-attempt budget is exhausted. Centralize a detail-attempt cap of 10 times the requested insert limit and a maximum of 200 extracted candidates per source; report truncation/exhaustion. Duplicates/rejections do not consume the insert allowance.
10. Check canonical and original dedupe again after detail parsing and before insert. Keep in-run aliases. Treat recognized URL/canonical unique conflicts from concurrent requests as duplicates; propagate other DB failures. Never update, replace, delete, or reset existing articles. New rows have `analyzed_at: null` and a real scrape timestamp.
11. Expose a reusable function that accepts a source plus homepage HTML and runs extraction through insertion. Manual orchestration fetches the homepage separately, so Scheduler can later reuse the same pipeline.
12. Isolate detail/source failures and continue remaining work. Emit console events and persistent logs for start, source selection/start, homepage result, candidates, prefetch rejects, duplicate skips, detail results, validation rejects, inserts, source errors, and final completion/failure. Log-write failure must not stop scraping.
13. Final summary includes status, sources checked, candidates found, candidates rejected, duplicates skipped, detail pages scraped, articles inserted, articles rejected after validation, articles failed, duration in milliseconds, and rejection reasons grouped by count. Include source-level outcomes and distinguish failed requests from successful detail fetches. Keep counters consistent across failure paths.

## Security requirements

- Mark credential access, Oxylabs calls, pipeline, and DB modules server-only. No browser pipeline actions or secret exposure.
- Compare admin secrets safely; never accept query-string secrets. Return sanitized errors without raw provider responses, auth headers, keys, or raw HTML.
- No user-supplied fetch URLs. Validate source URLs and extracted/final/canonical destinations and trusted host boundaries; do not follow scraped instructions.
- Preserve Supabase RLS and existing service-role access. Keep raw article text out of API summaries/logs.
- Use explicit TypeScript types and validated unknown external data; no `any`.

## Acceptance criteria and checks

- Authorized default and selected-source requests run the complete homepage-to-insert flow; invalid requests do not start work.
- All five configured strategies have positive and negative fixture coverage, including section/program/live/product links, boilerplate cleanup, metadata omissions, and one long paragraph.
- Focused tests verify original/canonical dedupe, concurrent uniqueness conflicts, 15-value chunking, valid-insert limits, provider failure isolation, accurate counters, and fail-closed admin checks.
- Live test uses the selected/default active sources and limits, inspects resulting rows and logs through read-only Supabase queries, and reports actual insert/reject counts honestly. Fewer valid articles is acceptable; never weaken the gate to fill quotas.
- Repeat a selected-source scrape to verify already-known URLs are skipped; new homepage articles may legitimately be inserted on the repeat. Record pre-existing row IDs/counts to verify they remain intact.
- Run `npm run typecheck`, `npm run lint`, and `npm run build`, plus focused tests. Report actual command output and any failures; do not claim checks not run. Investigate relevant failures without unrelated refactors.
- Scraped rows remain pending analysis and do not appear in the analyzed feed until the later AI stage. Do not present `/api/analyze` as available in this task.

## Exact manual test steps after implementation

1. Confirm the required Supabase, Oxylabs, and admin values exist in `.env.local`; start `npm run dev`. Watch that terminal for all scrape progress and final summary logs.
2. In another local terminal, load only the admin secret into the shell without displaying it:

```sh
export BIASLY_ADMIN_SECRET="$(node -e 'require("@next/env").loadEnvConfig(process.cwd()); process.stdout.write(process.env.BIASLY_ADMIN_SECRET || "")')"
curl -i http://localhost:3000/api/sources
curl -i -X POST http://localhost:3000/api/scrape -H 'Content-Type: application/json' -d '{}'
curl -i http://localhost:3000/api/scrape
```

Expected: active source list, 401, and 405 respectively, with no scrape for the latter two.

3. User-selected test run: all active sources, up to one new valid article each. An empty object would instead use the endpoint default of five per source.

```sh
curl -i -X POST http://localhost:3000/api/scrape \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"articlesPerSource":1}'
```

4. Selected source run, repeat once to check duplicate skipping; obtain a current active source ID from `/api/sources` if it changed:

```sh
curl -i -X POST http://localhost:3000/api/scrape \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"sourceIds":["97905799-252e-4de3-a178-158991b4884a"],"articlesPerSource":1}'
curl -i 'http://localhost:3000/api/logs?limit=50' \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"
```

5. Validate request rejection without scraping:

```sh
curl -i -X POST http://localhost:3000/api/scrape \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"articlesPerSource":0}'
```

Expected: 400. In Supabase Table Editor inspect new `articles`: source reference, article-specific URLs/title, valid image/date, clean readable text, scrape timestamp, null analyzed timestamp; inspect `logs` for matching run outcomes. Existing articles remain intact.

## Follow-up correction: NPR and Reuters

Authorized by the user's request to resolve the outstanding issues in this approved implementation. Existing scope, security requirements, and acceptance criteria continue to apply.

Observed live homepage HTML: NPR uses `.story-text a > h3.title`, so the prior descendant-link selector found section labels only. Reuters main cards use `a[data-testid="TitleLink"]` with `TitleHeading` spans; the old Heading selector missed them and selected older photo features. Update these selectors without broadening to all anchors or weakening URL/content validation. Inspect the rejected provider envelope and distinguish unsuccessful/empty results from malformed successful responses. Files: `lib/parsing/homepage.ts`, `lib/oxylabs/client.ts` if required, `tests/scrape.test.ts`, and verification report. No UI/schema/credential changes. Add regressions for both observed card structures and provider failure envelopes. Test only NPR and Reuters, up to one inserted article per source, using active database rows. Run test:scrape, typecheck, lint, build; verify inserted data and logs. Manual command: authorized POST /api/scrape with their current sourceIds and articlesPerSource=1; GET /api/logs with the admin header. Watch the dev-server terminal.

Follow-up observation: Reuters body blocks are `div[data-testid="paragraph-N"]`, requiring `lib/parsing/article.ts` to recognize these as paragraphs. Regression coverage verifies short meaningful blocks and inline links. The reported malformed provider response was an empty 301, now classified by target status before validating successful content.
