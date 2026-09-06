# Prompt: skew / biasly Home Page UI

## Goal

Implement the **home page** (`/`) exactly as shown in the attached UI reference:
a top utility bar, main header with brand + nav + auth buttons, a horizontally
scrollable category chip rail, a "Top News" 3-column card grid, and a dark
footer.

This is **presentational only** — no Supabase, Clerk, Oxylabs, AI, or API routes.
The page renders from a typed local mock module so the later Supabase query layer
can drop in without touching the components (AGENTS §5: "UI must display stored
data only", and must not scrape/analyze/mutate pipeline state).

## Skills / docs read

- `AGENTS.md` (full) — workflow §2, prompt spec §4, architecture §5, stack §6,
  card content requirements §19, security §21, checks §22.
- `node_modules/next/dist/docs/01-app/` — App Router page conventions, `next/font`,
  `next/image` (already exercised by `prompts/design-system.md`).
- Not read (not needed, no data layer in this task): `.agents/skills/supabase`,
  `clerk`, `oxylabs-web-scraper`, `ai-sdk`.

## Existing code inspected

- `app/page.tsx` — stub `Home` returning `<div>Home</div>`. Will be replaced.
- `app/layout.tsx` — Poppins via `next/font`, `min-h-full flex flex-col` body,
  metadata already set to "biasly News — Balanced news coverage, powered by AI".
- `app/globals.css` — design-system tokens: `text-primary #0d0d0f`,
  `text-secondary #6b7280`, `surface #f6f6f6`, `bg-primary #ffffff`,
  `bg-secondary #f0f0f0`, `divider/border #e5e7eb`, bias colors
  `left #b42318` / `center #e5e7eb` / `right #1d4ed8`; type scale
  `h1 32 / h2 24 / h3 20 / h4 16 / body-lg 16 / body-md 14 / body-sm 13 /
  caption 11`; radii `sm 4 / md 8 / lg 12 / full`; `--spacing: 4px`;
  `container-page` utility (max 1280px, 24px inline padding).
- `components/bias-meter.tsx` — `left/center/right` percentages, `size="sm"|"md"`,
  optional scale. Renders "Left 20%" / "Center 31%" / "Right 49%" segments —
  matches the reference bars. **Reused as-is.**
- `components/category-chip.tsx` — pill with optional trailing `+`. **Reused as-is.**
- `components/icon.tsx` — lucide wrapper registry. Needs additions.
- `components/article-card.tsx` — horizontal card (image left, summary, clock +
  bookmark meta) built for the design-system sheet. The home grid card is a
  **different** composition (image on top, info badge overlay, no summary,
  "N sources" footer), so it is left untouched and a new component is added.
- `components/ui/button.tsx` — shadcn button, used for Subscribe / Login.
- `package.json` — Next 16.3.4, React 19.2.8, Tailwind v4, lucide-react ^1.41.
  Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.
- `public/placeholder-article.png` — local placeholder used for every mock card
  (keeps `next.config.ts` free of `images.remotePatterns`).
- Verified in `lucide-react@1.41`: `Globe`, `ChevronRight`, `ChevronLeft`,
  `MapPin` exist; `Twitter`, `Linkedin`, `Instagram`, `Youtube` **do not**
  (brand icons were removed).

## Decisions / assumptions

1. **Mock data, typed for the real schema.** Add `lib/mock/home.ts` exporting a
   `HomeArticle` type whose fields map 1:1 onto the future
   `articles` + `article_analyses` join (title, source/category, location,
   imageUrl, publishedAt, left/center/right percentages, sourceCount). Twelve
   entries reproducing the reference copy. No fetching, no `async` page.
2. **New component, not a variant flag.** `components/news-card.tsx` renders the
   grid card. `ArticleCard` stays as the design-system sheet's horizontal card.
3. **Auth buttons are static.** Clerk is not installed yet; Subscribe/Login are
   plain buttons with no href behaviour. No `ClerkProvider`, no middleware.
4. **Footer brand icons are inline SVGs** (X, LinkedIn, Instagram, YouTube) in
   `components/social-icons.tsx`, since lucide v1 dropped them.
5. **Interactive bits are minimal.** The theme switcher (Light/Dark/Auto), edition
   dropdown, "Set Location", nav links, and chip rail are rendered to match the
   design but are non-functional; the app is light-only per `globals.css`. The
   chip rail scrolls natively (`overflow-x-auto`) with the right-edge chevron as a
   visual affordance. Everything stays a **server component** — no `"use client"`.
6. **Date in the utility bar is static mock copy** ("Monday, June 1, 2026") to keep
   the page a server component with no hydration mismatch.

## Files likely to change

- `app/page.tsx` — replaced with the composed home page.
- `components/site-header.tsx` — new: utility bar + main header + chip rail.
- `components/site-footer.tsx` — new: dark footer.
- `components/news-card.tsx` — new: grid card.
- `components/social-icons.tsx` — new: inline brand SVGs.
- `components/icon.tsx` — add `globe`, `chevron-right`, `chevron-left`, `map-pin`.
- `lib/mock/home.ts` — new: typed mock articles + category list + nav config.

No changes to `globals.css`, `layout.tsx`, `next.config.ts`, or existing
components other than the icon registry.

## Visual interpretation

**Utility bar** — full-bleed `#0d0d0f` strip, ~36px tall, `caption` (11px) text in
a muted grey. Left: "Browser Extension", then "Theme:" with Light (white, bold) /
Dark / Auto. Right: the date, "Set Location", and a globe + "International
Edition" + chevron-down. Contents constrained to `container-page`.

**Main header** — white, ~72px tall, bottom `1px` divider. Left: hamburger (24px),
then the wordmark: "biasly" at `h1`-ish weight 700 with a small "News" beneath in
`caption` uppercase-ish grey — rendered as text, not an image. Nav follows with
28–32px gaps in `body-md` weight 500: Home (active — `text-primary`, with a 2px
underline flush to the header's bottom edge), For You (with a small `#b42318` dot
superscript), Local, Blindspot — inactive links `text-secondary`. Right:
"Subscribe" solid black pill-less rounded-md button, "Login" outlined button.

**Chip rail** — `bg-surface` band, ~48px tall, bottom divider, chips in a single
horizontally scrolling row with 8px gaps, scrollbar hidden. Each chip is the
existing `CategoryChip` with `addable`. A partially clipped chip is visible at the
left edge and a chevron-right sits at the right edge to imply overflow.

**Top News** — `container-page`, 32px top padding. Heading "Top News" at `h2`
(24px / 600). Grid below: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, 24px gap.

**News card** — white, `rounded-md`, `1px` border `#e5e7eb`, `shadow-sm`, overflow
hidden. Structure top → bottom:
- 16:10 cover image, `object-cover`, full-bleed to the card edges, with a 28px
  circular white/80 translucent info badge (lucide `info`, 14px) at top-right,
  12px inset.
- Body padded 16px: `caption` grey line "Category · Location"; then title at
  `text-h4`-to-`h3` weight 600, `leading-snug`, `line-clamp-3`, 8px below.
- `BiasMeter size="sm"` with the article's L/C/R percentages, 16px below the title.
- A divider-less footer row 12px below the meter: "N sources" in `body-sm` grey.

**Footer** — full-bleed `#0d0d0f`, ~150px of content padding, `container-page`
inside. Left column: the white wordmark + "Balanced news coverage powered by AI."
in `body-sm` grey. Then three link columns — Company (About, Careers, Press,
Contact), Help (Help Center, Guides, Privacy Policy, Terms of Service), Connect
(the four social icons in a row). Column headings `body-sm` weight 600 white;
links `body-sm` grey with hover-to-white. A hairline `#2a2a2e` divider above a
bottom bar: "© 2026 Biasly News. All rights reserved." in `caption` grey.

## Responsiveness

- `< 640px` — single-column card grid; utility bar collapses to just
  "Browser Extension" + edition (date/theme/location hidden via `hidden sm:flex`);
  main nav links hidden behind the hamburger (the hamburger stays static, no menu
  panel); Subscribe hidden, Login kept; footer link columns stack to 1 column.
- `640–1024px` — two-column grid; footer columns 2-up.
- `≥ 1024px` — three-column grid, full nav, footer 4-up (brand + 3 columns).
- No horizontal page scroll at any width; only the chip rail scrolls sideways.
- Images use `next/image` with `fill` + correct `sizes`.

## Implementation requirements

- TypeScript, explicit prop types, no `any`.
- Server components only; no `"use client"`, no state, no effects.
- Style exclusively with the existing design tokens (`text-h*`, `text-body-*`,
  `text-caption`, `bg-surface`, `border-border`, `text-text-secondary`,
  `bias-*`) — no new hex values except the footer's `#2a2a2e` hairline, added
  inline via an arbitrary value.
- Compose with `cn` from `@/lib/utils`.
- Semantic markup: `<header>`, `<nav>`, `<main>`, `<article>`, `<footer>`; the
  chip rail nav labelled; images have real `alt` text; the info badge is a
  `<button type="button">` with an `aria-label`.
- Keep components small — no component file over ~120 lines.

## Security requirements

- No secrets, no env vars, no server-side credentials touched.
- No network calls, no Oxylabs / OpenAI / Supabase access from this page.
- Nothing added to browser code beyond static markup (AGENTS §21).

## Acceptance criteria

1. `/` renders header, chip rail, "Top News" heading, a 12-card grid, and footer
   matching the reference layout.
2. Each card shows image, category · location, title, L/C/R bias bar with
   percentages, and source count (AGENTS §19 card fields, minus the ones with no
   mock analogue yet).
3. Percentages per card sum to 100.
4. Light-only; no OS dark-mode leakage.
5. No layout shift or horizontal overflow at 375 / 768 / 1440 px.
6. `/design-system` still renders unchanged.
7. `npm run typecheck`, `npm run lint`, `npm run build` all pass.

## Checks to run

```
npm run typecheck
npm run lint
npm run build
```

## Manual test steps

1. `npm run dev`
2. Open `http://localhost:3000/` — verify header, chip rail, 12 cards in a
   3-column grid, and the dark footer.
3. Resize to 375px and 768px — confirm 1-column then 2-column grids, no
   horizontal page scroll, and that only the chip rail scrolls sideways.
4. Open `http://localhost:3000/design-system` — confirm it is unaffected.
