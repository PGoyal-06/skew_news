# Prompt: Require sign-in for news detail pages

## Goal

Gate the full article analysis behind authentication. The home feed stays fully public; opening `/news/<slug>` while signed out sends the visitor to Clerk sign-in and returns them to the article afterwards.

Scope:

- Protect `/news/(.*)` in `proxy.ts` with `createRouteMatcher` + `auth.protect()`.
- Add a server-side auth guard inside the news detail page itself.

Out of scope: paywall/teaser previews of article content, gating the home feed or `/design-system`, per-plan or per-role gating (no Clerk Billing/Orgs in this project), changing the news card UI.

## Skills read

- `clerk-nextjs-patterns` skill — `references/middleware-strategies.md` (public-first strategy), server vs client auth, `await auth()` in Server Components.
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — Proxy "should not be used as a full session management or authorization solution"; it is for optimistic checks.

## Existing code inspected

- `proxy.ts` — currently bare `clerkMiddleware()` with the standard matcher, no protected routes (decision 3 of `prompts/clerk-authentication.md`, now superseded for `/news`).
- `app/news/[slug]/page.tsx` — already an `async` Server Component taking `PageProps<"/news/[slug]">`, calls `getArticleDetail(slug)` and `notFound()`.
- `app/page.tsx` / `components/news-card.tsx` — home feed links straight to `/news/<slug>`.
- `.env.local` — `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`.

## Decisions and assumptions

1. **Redirect, not a teaser.** "Opening a full article analysis requires signing in" reads as a hard gate, so signed-out visitors are redirected to `/sign-in` rather than shown a truncated preview.
2. **Two layers, deliberately.** `auth.protect()` in `proxy.ts` gives the clean redirect UX; a `const { isAuthenticated } = await auth()` guard in the page is the actual enforcement. The Next.js proxy docs explicitly say Proxy is not a full authorization solution — matcher config is easy to break, and the page guard means a config slip cannot leak the analysis.
3. **Return-to-article after sign-in.** `auth.protect()` attaches `redirect_url` automatically, so Clerk sends the user back to the article. `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/` only applies when no `redirect_url` is present, so it stays as-is.
4. **Whole `/news` subtree protected**, matching `/news(.*)`, so any future route under it is gated by default rather than by omission.
5. **Home feed unchanged.** The cards still link to articles; the gate fires on click. No lock badge is added — not requested.
6. The page guard uses `redirect()` from `next/navigation` with the article path as `redirect_url`, so the direct-hit path behaves the same as the proxy path.

## Files likely to change

| File | Change |
| --- | --- |
| `proxy.ts` | add `createRouteMatcher(['/news(.*)'])` and `await auth.protect()` |
| `app/news/[slug]/page.tsx` | add `await auth()` guard before rendering |

## Implementation requirements

### 1. `proxy.ts`

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/news(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});
```

Keep the existing `config.matcher` exactly as-is. Update the file comment: the home feed and auth pages stay public, `/news` requires a session, and action routes still use `x-biasly-admin-secret`.

### 2. `app/news/[slug]/page.tsx`

At the top of the component, before `getArticleDetail`:

```ts
const { isAuthenticated } = await auth();

if (!isAuthenticated) {
  redirect(`/sign-in?redirect_url=/news/${slug}`);
}
```

- Import `auth` from `@clerk/nextjs/server` (server import — never `@clerk/nextjs`).
- `isAuthenticated` is the Core 3 replacement for the `!!userId` pattern.
- `redirect()` comes from `next/navigation`, already imported alongside `notFound` in this file.
- Encode the slug into the redirect URL safely.

## Security requirements

- Server-only import path `@clerk/nextjs/server` for `auth()`; no secret key reaches client code.
- The gate must be enforced server-side — no client-side-only hiding of article content, since the analysis must not ship in the RSC payload for signed-out visitors.
- Do not weaken the existing matcher; API routes must stay in it.
- `x-biasly-admin-secret` and `CRON_SECRET` protection for action/cron routes is unaffected — Clerk does not replace either.

## Acceptance criteria

1. Signed out, `GET /news/<slug>` redirects to `/sign-in` and the response body contains no article text.
2. After signing in from that redirect, the user lands back on the article they requested.
3. Signed in, `/news/<slug>` renders exactly as before.
4. `/`, `/sign-in`, `/sign-up`, and `/design-system` remain reachable signed out.
5. `npm run typecheck`, `npm run lint`, and `npm run build` pass.

## Checks to run

```bash
npm run typecheck
npm run lint
npm run build
```

## Manual test steps

1. `npm run dev`. If signed in, sign out via the header avatar first.
2. From the home page, click any news card → should land on `/sign-in` with the article URL carried as `redirect_url`.
3. Sign in → should land on that article with the full analysis panel visible.
4. Reload the article while signed in → renders normally.
5. Sign out again, then paste an article URL directly into the address bar → redirected to sign-in.
6. `curl -s -i http://localhost:3000/news/<slug>` with no cookies → expect a redirect status and no article body in the response.

---

## Revision 2 — drop `createRouteMatcher` (deprecation warning)

### Trigger

`@clerk/nextjs@7.9.1` logs at runtime:

> `createRouteMatcher` is deprecated and will be removed in the next major release. Use resource-based auth checks instead. Move auth checks into each page, layout, API route, or Server Function that accesses protected data. Middleware-based auth checks rely on path matching, which can diverge from how Next.js routes requests and leave protected resources reachable.

### Skills / docs read

- `https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher` — the official migration guide.

### What the guide says

- Protect each resource individually with `await auth.protect()` at its entry point (page, Route Handler, Server Function).
- "Keep `clerkMiddleware()` and your existing `config.matcher` export; they're still required. Only remove the authentication checks."
- A middleware pathname redirect may be kept as a **performance optimization only, not an auth guarantee** — and can be removed at any time without weakening security.

This vindicates decision 2 of revision 1: the page-level guard was already the real enforcement, and the proxy check was always labelled UX-only. Nothing about the security posture changes here — the deprecated half is being removed, and the half that actually protects the resource stays.

### Decisions

1. **Remove `createRouteMatcher` and `auth.protect()` from `proxy.ts` entirely**, returning it to a bare `clerkMiddleware()` with the unchanged `config.matcher`.
2. **Do not keep the optional middleware early redirect.** It is explicitly not a security boundary, and the page guard already produces the same visible outcome — a 307 to `/sign-in` carrying the article URL — so a second code path would be duplicated logic with no user-visible gain.
3. **Decide the page guard's form empirically.** Try the canonical `await auth.protect()` in `app/news/[slug]/page.tsx`; keep it only if the resulting redirect still carries a `redirect_url` back to the requested article. If it does not, retain the existing explicit `isAuthenticated` + `redirect()` guard, which was verified to do so. Return-to-article after sign-in is a shipped behavior and must not regress.

### Files likely to change

| File | Change |
| --- | --- |
| `proxy.ts` | remove `createRouteMatcher` import, matcher const, and the `auth.protect()` callback; update the comment |
| `app/news/[slug]/page.tsx` | possibly simplify the guard to `await auth.protect()`, per decision 3 |

### Acceptance criteria

1. No `createRouteMatcher` deprecation warning in the dev server log on any request.
2. Signed out, `GET /news/<slug>` still redirects to `/sign-in` with the article URL as `redirect_url`, and the response body contains no article or analysis text.
3. `/`, `/sign-in`, `/sign-up`, `/design-system` still reachable signed out.
4. Signed in, the article renders unchanged.
5. `npm run typecheck`, `npm run lint`, `npm run build` pass.

### Checks and manual tests

Same as revision 1, plus: grep the dev server log for `DEPRECATION` after hitting a protected and an unprotected route, and confirm it is empty.
