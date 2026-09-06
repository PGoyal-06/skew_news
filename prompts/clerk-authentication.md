# Prompt: Clerk authentication

## Goal

Add Clerk authentication to biasly per `AGENTS.md` section 1 ("Clerk authentication"), section 6 (tech stack), and section 21 (security / env vars).

Scope:

- Wire `ClerkProvider` into the root layout.
- Add `proxy.ts` (Next.js 16 name for middleware) running `clerkMiddleware()`.
- Add dedicated `/sign-in` and `/sign-up` catch-all pages.
- Replace the static `Login` button in `SiteHeader` with real signed-out / signed-in auth UI.
- Add the Clerk env vars to a new `.env.example`.

Out of scope: Supabase Auth (forbidden), org/billing/webhooks, Clerk-protected API routes (action routes use `x-biasly-admin-secret` per section 15), user profile pages, syncing Clerk users into Supabase.

## Skills read

- `.agents/skills/clerk/SKILL.md` — router; version table.
- `clerk-setup` skill — Next.js quickstart flow, `ClerkProvider` placement, `proxy.ts` vs `middleware.ts`, shadcn theme guidance, common pitfalls.
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — Next.js 16 renamed Middleware to Proxy; file must be `proxy.ts` at project root.
- Clerk docs fetched live: `https://clerk.com/docs/nextjs/getting-started/quickstart` and `https://clerk.com/docs/nextjs/guides/development/custom-sign-in-or-up-page`.

## Existing code inspected

- `app/layout.tsx` — Poppins font, `LayoutProps<"/">` typed root layout, `<body className="min-h-full flex flex-col">`.
- `app/page.tsx`, `app/news/[slug]/page.tsx` — public pages rendering mock data via `SiteHeader` / `SiteFooter`.
- `components/site-header.tsx` — has a hardcoded, non-functional `Login` button and a `Subscribe` button.
- `app/globals.css` — Tailwind v4 `@theme` design tokens; light-only (`dark:` variant pinned to an unrendered `.dark`).
- `components.json` — shadcn/ui present (`style: base-nova`).
- `package.json` — `next@16.3.4`, `react@19.2.8`, no Clerk packages yet.
- `.env.local` — already contains `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. No `.env.example` exists yet.
- No `middleware.ts` / `proxy.ts` and no `src/` directory.

## Decisions and assumptions

1. **SDK version: current (v7).** `@clerk/nextjs@7.9.1` is latest and this is a new integration, so use current-SDK APIs (`<Show when="signed-in">`), not Core 2 `<SignedIn>` / `<SignedOut>`. Node is v24.16.0, above the v20.9.0 minimum.
2. **`proxy.ts`, not `middleware.ts`.** Next.js 16 renamed the convention. File goes at the project root (same level as `app/`).
3. **All current routes stay public.** biasly is a public news site: home and news detail pages must render for signed-out visitors. `clerkMiddleware()` does not protect anything by default, so ship it without a `createRouteMatcher` protected list rather than inventing a gated area that the product spec does not ask for. Auth state only changes the header UI.
4. **Dedicated sign-in/sign-up pages**, not modal-only, because the `AGENTS.md` env table lists `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` / `_*_FALLBACK_REDIRECT_URL`.
5. **Keys already exist** in `.env.local`; do not overwrite them and do not run `clerk init`. Only add the four route-config `NEXT_PUBLIC_CLERK_*` values.
6. **No shadcn Clerk theme package.** `clerk-setup` suggests `@clerk/ui`'s shadcn theme when `components.json` exists, but biasly's design system is a custom Tailwind v4 `@theme` token set that is not shadcn's CSS-variable palette, and the app is deliberately light-only. Installing `@clerk/ui` + `@clerk/ui/themes/shadcn.css` would pull a second color system into `globals.css`. Ship Clerk's default appearance; restyling can be a separate design task.
7. **Header `Subscribe` button stays as-is** — it is unrelated presentational chrome.
8. `.env.example` is created now with the Clerk block plus placeholders for the other `AGENTS.md` section 21 variables, so the canonical list exists from here on.

## Files likely to change

| File | Change |
| --- | --- |
| `package.json` / `package-lock.json` | add `@clerk/nextjs` |
| `proxy.ts` (new) | `clerkMiddleware()` + matcher |
| `app/layout.tsx` | wrap children in `<ClerkProvider>` inside `<body>` |
| `app/sign-in/[[...sign-in]]/page.tsx` (new) | `<SignIn />` |
| `app/sign-up/[[...sign-up]]/page.tsx` (new) | `<SignUp />` |
| `components/site-header.tsx` | replace static Login button with Clerk auth controls |
| `.env.local` | add the four `NEXT_PUBLIC_CLERK_*` route vars |
| `.env.example` (new) | canonical env var list |

## Implementation requirements

### 1. Install

```bash
npm install @clerk/nextjs
```

### 2. `proxy.ts` (project root)

```ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

No `createRouteMatcher` / `auth.protect()` — every route stays public (decision 3).

### 3. `app/layout.tsx`

Import `ClerkProvider` from `@clerk/nextjs` and place it **inside `<body>`**, wrapping `{children}`. Keep the existing `min-h-full flex flex-col` body classes and the `LayoutProps<"/">` typing. Do not wrap `<html>`.

### 4. Sign-in / sign-up pages

`app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return <SignIn />
}
```

`app/sign-up/[[...sign-up]]/page.tsx` mirrors it with `<SignUp />`.

Both pages should center the Clerk card in the page: render inside a `main` with `flex flex-1 items-center justify-center bg-bg-primary px-6 py-16` using existing design tokens, so the card is not flush against the top-left of the viewport. Do not render `SiteHeader` / `SiteFooter` on these pages — keep the auth screens focused.

### 5. `components/site-header.tsx`

The file is a server component today and stays one — Clerk's control components work in RSC. Replace the static `Login` `<button>` with:

```tsx
import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/nextjs'
```

- `<Show when="signed-out">` → `SignInButton` (mode inherited, routes to `/sign-in`) rendered with the existing Login button classes, and optionally the existing `Subscribe`-styled `SignUpButton`. Use `asChild` where needed so the existing Tailwind classes survive.
- `<Show when="signed-in">` → `<UserButton />` in place of the Login button.
- Keep the button markup/classes identical to today's so the header does not shift visually: Login keeps `rounded-md border border-border bg-bg-primary px-5 py-2.5 text-body-md font-medium text-text-primary transition-colors hover:bg-surface`.

If `Show` is not exported by the installed version, fall back to `<SignedIn>` / `<SignedOut>` from `@clerk/nextjs` and note it in the summary.

### 6. Env vars

Append to `.env.local` (keep the existing keys untouched):

```
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

Create `.env.example` with the same keys (empty values for secrets) plus placeholder entries for the remaining `AGENTS.md` section 21 variables. `CRON_SECRET` is documented as Vercel-injected and must not be listed as a local value.

Confirm `.env.local` is gitignored; `.env.example` must be committed.

## Security requirements

- `CLERK_SECRET_KEY` is server-only — never imported into a client component, never logged, never in `.env.example` with a real value.
- Only `NEXT_PUBLIC_CLERK_*` values may reach browser code (section 21).
- No secret values pasted into prompt files, commits, or terminal output.
- Clerk must not replace or duplicate the `x-biasly-admin-secret` protection on action routes, and must not be used to protect `/api/cron/pipeline` (that uses `CRON_SECRET`).
- Supabase Auth remains unused (section 6).

## Acceptance criteria

1. `/` and `/news/<slug>` render for signed-out visitors exactly as before, with the header Login button now opening Clerk sign-in.
2. `/sign-in` and `/sign-up` render Clerk's forms and are reachable while signed out.
3. After signing in, the header shows `UserButton` instead of Login, and signing out returns the header to the signed-out state.
4. `proxy.ts` exists at the project root, exports `clerkMiddleware()` and a matcher; no `middleware.ts` is created.
5. `ClerkProvider` sits inside `<body>` in `app/layout.tsx`.
6. No secret key reaches client code; `.env.example` exists and matches the section 21 table.
7. `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

## Checks to run

```bash
npm run typecheck
npm run lint
npm run build
```

`build` is included because this change adds routes, a root-level proxy file, and a provider in the root layout.

## Manual test steps

1. `npm run dev` and open `http://localhost:3000`.
2. Confirm the home page renders signed-out with the news cards and the header Login button.
3. Click **Login** → lands on Clerk sign-in (`/sign-in`).
4. Create an account at `http://localhost:3000/sign-up`, complete verification.
5. Confirm redirect back to `/` and that the header now shows the Clerk `UserButton` avatar.
6. Open a news detail page (`/news/<slug>` from the home page) and confirm it renders while signed in, with the same header state.
7. Open the `UserButton` menu → **Sign out** → confirm the header returns to the Login button and pages still render.
8. Open DevTools → Sources/Network and confirm no `sk_` value appears in any client bundle or request payload.
