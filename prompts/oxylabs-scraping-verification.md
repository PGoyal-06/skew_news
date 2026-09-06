# Final verification — NPR and Reuters resolved (2026-09-06)

The manual scraping implementation is complete for the five configured sources. BBC, Fox, and Guardian were verified in the user's run; NPR and Reuters now also insert successfully. These are separate live runs, not a claim that a new all-five run was performed.

Corrections:
- NPR story anchors wrap headline elements; select that observed markup instead of section-label links.
- Reuters main cards use TitleLink/TitleHeading attributes; select those current stories.
- Reuters paragraphs use numbered div blocks; extract their text and inline links without admitting boilerplate or lowering the content gate.
- Empty 301 provider results now report target_http_301 rather than invalid_provider_response. Redirect protections remain enabled.

Live verification:
- NPR run d770c6fc-bb2d-4810-8456-7da246f24c27: 1 inserted, 0 failed; the same run exposed Reuters body-selector failures, which were subsequently corrected.
- Reuters final run 90553ae8-d860-4e96-8d53-97179a023e94: completed, 1 detail attempt, 1 inserted, 0 rejected, 0 failed.
- Supabase read verification: NPR article 3c9bdb48-e094-4e54-be28-8fdb5f9d1cc8 has 9,011 characters / 33 paragraphs; Reuters article bc59b2a3-7947-4022-bb27-ce97c3e818d5 has 3,189 characters / 14 paragraphs. Both have image URLs, publication dates, and null analyzed_at.
- 21 regression tests passed; typecheck, lint, and production build exited 0.

Retest NPR and Reuters (up to one new article each):

```sh
export BIASLY_ADMIN_SECRET="$(node -e 'require("@next/env").loadEnvConfig(process.cwd()); process.stdout.write(process.env.BIASLY_ADMIN_SECRET || "")')"
curl -i -X POST 'http://localhost:3001/api/scrape' \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"sourceIds":["d40435b6-4173-43a8-bc1b-dd1260b0dba2","806ae74d-d665-4694-9f2a-7c76931d7f63"],"articlesPerSource":1}'
curl -i 'http://localhost:3001/api/logs?limit=50' \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"
```

Use the port printed by `npm run dev` (currently 3001), and watch its terminal for progress. Articles remain pending AI analysis. Each repeat may insert another new article after skipping stored URLs.

## Final check output

### npm run typecheck

```text
npm notice run skew@0.1.0 typecheck
npm notice run tsc --noEmit
```

### npm run lint

```text
npm notice run skew@0.1.0 lint
npm notice run eslint
```

### npm run build

```text
npm notice run skew@0.1.0 build
npm notice run next build
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 9ms

  Creating an optimized production build ...
✓ Compiled successfully in 495ms
  Running TypeScript ...
  Finished TypeScript in 801ms ...
  Collecting page data using 9 workers ...
  Generating static pages using 9 workers (0/7) ...
  Generating static pages using 9 workers (1/7) 
  Generating static pages using 9 workers (3/7) 
  Generating static pages using 9 workers (5/7) 
✓ Generating static pages using 9 workers (7/7) in 213ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/logs
├ ƒ /api/scrape
├ ƒ /api/sources
├ ○ /design-system
├ ƒ /news/[slug]
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

### npm run test:scrape

```text
ℹ tests 21
ℹ suites 0
ℹ pass 21
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 211.187458
```

---

## Historical verification (superseded by results above)

# Oxylabs scraping verification — 2026-09-05

## Result

Implemented the approved manual pipeline, reusable homepage processor, parsers, admin guard, source/log routes, and append-only database helpers. Added a 270-second work budget under the route's 300-second maximum; unfinished sources are reported, not silently dropped. The API default is five inserted articles per active source; the approved live test used one each.

`BIASLY_ADMIN_SECRET` was missing and was generated in `.env.local` under the approved prompt. No secret value was printed. No schema changes were needed.

## Live checks

The existing dev server is at [http://localhost:3001](http://localhost:3001). Port 3000 was serving an older production build and returned 404 for the new routes.

- GET /api/sources: 200; BBC News, Fox News, NPR, Reuters, The Guardian.
- GET /api/scrape: 405.
- POST /api/scrape without secret: 401.
- POST /api/scrape with articlesPerSource=0: 400.
- Authorized POST /api/scrape with articlesPerSource=1: 500, status failed. All five homepage calls returned oxylabs_http_401. Zero articles inserted, zero detail pages fetched.
- Direct Oxylabs request with freshly loaded environment values also returned 401; the failure is reproducible outside the application route.
- Authorized GET /api/logs?limit=30: 200; 17 persisted records, last event scrape.failed.
- Supabase verification: one article before and after; existing IDs, original URLs, and canonical URLs unchanged.

Successful live parsing/insertion and a live duplicate repeat remain unverified because Oxylabs rejected authentication. Offline tests cover parsing, duplicates, concurrent canonical conflicts, URL chunking, failure isolation, and authorization. Update OXY_WSA_USERNAME and OXY_WSA_PASSWORD with valid Web Scraper API credentials, then rerun the commands below. Do not relax the content gate to obtain more results.

## Manual test commands

Run `npm run dev` and use the port printed by Next.js (currently 3001). Watch that server terminal for scrape progress and final summary. In another terminal:

```sh
export BIASLY_ADMIN_SECRET="$(node -e 'require("@next/env").loadEnvConfig(process.cwd()); process.stdout.write(process.env.BIASLY_ADMIN_SECRET || "")')"
curl -i http://localhost:3001/api/sources
curl -i -X POST http://localhost:3001/api/scrape \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"articlesPerSource":1}'
curl -i 'http://localhost:3001/api/logs?limit=50' \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"
```

Optional selected-source repeat (BBC, one new valid article maximum):

```sh
curl -i -X POST http://localhost:3001/api/scrape \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"sourceIds":["97905799-252e-4de3-a178-158991b4884a"],"articlesPerSource":1}'
```

Repeat after a successful scrape to verify previously stored URLs are skipped. New homepage stories may still produce new inserts. Inspect articles and logs in Supabase; saved articles must have a source, image, publication date, meaningful clean text, and null analyzed_at. The AI analysis stage is separate, so newly scraped articles remain outside the analyzed feed.

## Final check output

All commands below exited 0. An earlier build caught a HeadersInit type error in a new test; it was fixed before these final runs.

### npm run typecheck

```text
npm notice run skew@0.1.0 typecheck
npm notice run tsc --noEmit
```



### npm run lint

```text
npm notice run skew@0.1.0 lint
npm notice run eslint
```



### npm run build

```text
npm notice run skew@0.1.0 build
npm notice run next build
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 9ms

  Creating an optimized production build ...
✓ Compiled successfully in 740ms
  Running TypeScript ...
  Finished TypeScript in 860ms ...
  Collecting page data using 9 workers ...
  Generating static pages using 9 workers (0/7) ...
  Generating static pages using 9 workers (1/7) 
  Generating static pages using 9 workers (3/7) 
  Generating static pages using 9 workers (5/7) 
✓ Generating static pages using 9 workers (7/7) in 129ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/logs
├ ƒ /api/scrape
├ ƒ /api/sources
├ ○ /design-system
├ ƒ /news/[slug]
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```



### npm run test:scrape

Final test summary (17 passed):

```text
ℹ tests 17
ℹ suites 0
ℹ pass 17
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 300.329709
```

