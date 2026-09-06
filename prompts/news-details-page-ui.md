# Prompt: skew / biasly News Details Page UI

## Goal

Implement the **news details page** at `/news/[slug]` exactly as shown in the
attached UI reference: utility bar + main header (no category rail), a two-column
body (article on the left, analysis sidebar on the right), a Related Stories
grid, a full-width newsletter band, and the existing dark footer.

Presentational only — no Supabase, Clerk, Oxylabs, AI, or API routes. The page
renders from a typed local mock module shaped like the future
`articles ⋈ sources ⋈ article_analyses` join so the real query layer drops in
without touching components (AGENTS §5: UI displays stored data only and must
never scrape, analyze, or mutate pipeline state).

## Skills / docs read

- `AGENTS.md` (full) — workflow §2, prompt spec §4, architecture §5, stack §6,
  details-page content requirements §19, related-articles section §20,
  security §21, checks §22.
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
  — dynamic segments (`params` is a `Promise`), the globally generated
  `PageProps<'/news/[slug]'>` helper, `next/link` navigation.
- Not read (no data layer in this task): `.agents/skills/supabase`,
  `.agents/skills/clerk`, `.agents/skills/oxylabs-web-scraper`,
  `.agents/skills/ai-sdk`.

## Existing code inspected

- `app/layout.tsx` — Poppins via `next/font`, `min-h-full flex flex-col` body,
  already uses the generated `LayoutProps<"/">` helper.
- `app/page.tsx` — `SiteHeader` + `Top News` grid of `NewsCard` + `SiteFooter`.
  Cards are currently not links.
- `app/globals.css` — design tokens: `text-primary #0d0d0f`,
  `text-secondary #6b7280`, `surface #f6f6f6`, `bg-primary #ffffff`,
  `bg-secondary #f0f0f0`, `border/divider #e5e7eb`, bias
  `left #b42318` / `center #e5e7eb` / `right #1d4ed8`; type scale
  `h1 32 / h2 24 / h3 20 / h4 16 / body-lg 16 / body-md 14 / body-sm 13 /
  caption 11`; radii `sm 4 / md 8 / lg 12 / full`; `--spacing: 4px`;
  `container-page` (max 1280px, 24px inline padding). Light-only — `dark:`
  is pinned to an unrendered `.dark` ancestor.
- `components/site-header.tsx` — `UtilityBar` + brand/nav/auth row +
  `CategoryRail`. The reference details page has **no** chip rail, so the rail
  must become optional.
- `components/site-footer.tsx` — reused unchanged.
- `components/bias-meter.tsx` — segmented `Left 20% / Center 31% / Right 49%`
  track, `size="sm"|"md"`. Matches the reference "Bias Distribution" bar at
  `size="md"`. **Reused as-is.**
- `components/news-card.tsx` — home grid card; needs to link to the details page.
- `components/article-card.tsx` — horizontal design-system card; **not** the
  Related Stories composition (that one is a small thumbnail + 2-line title +
  date · read time), so it is left untouched.
- `components/icon.tsx` — lucide wrapper. `info`, `bookmark`, `share`, `more`
  are already registered — no additions needed.
- `lib/mock/home.ts` — `HomeArticle`, `TOP_NEWS`, `CATEGORIES`, `NAV_LINKS`,
  `TODAY_LABEL`. Article ids are slugs already (`trump-iran-peace-proposal`).
- `public/placeholder-article.png` — the only image asset; keeps
  `next.config.ts` free of `images.remotePatterns`.
- `package.json` — Next 16.3.4, React 19.2.8, Tailwind v4, lucide-react ^1.41.
  Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.

## Decisions / assumptions

1. **Route** — `app/news/[slug]/page.tsx`, a server component typed with the
   generated `PageProps<'/news/[slug]'>` helper; `params` is awaited. Unknown
   slugs call `notFound()`. `generateStaticParams` is **not** added (the real
   page will be data-driven).
2. **Mock module** — new `lib/mock/article.ts` exporting an `ArticleDetail`
   type + `ARTICLE_DETAILS` record keyed by slug and a
   `getArticleDetail(slug)` lookup. Field names map 1:1 onto the future
   join: `summaryBullets → article_analyses.summary`, `bias.{left,center,right}
   → left/center/right_percentage`, `biasLabel → bias_label`,
   `sentimentLabel → sentiment_label`, `confidence → confidence`,
   `framingNotes → framing_notes`, `loadedTerms → loaded_terms`,
   `disclaimer → disclaimer`, `related → getRelatedArticles()` (AGENTS §20).
   One fully-written entry for `trump-iran-peace-proposal` (the reference
   article, copy transcribed from the mockup); every other `TOP_NEWS` id gets a
   generated entry reusing its own title/category/bias/sourceCount so any home
   card opens a coherent page.
3. **AGENTS §19 vs. pixel fidelity.** The mockup does not draw sentiment,
   confidence, or loaded terms, but §19 requires the details page to show them.
   Resolution: keep the mockup's layout exactly, and surface the missing fields
   *inside* the Bias Analysis card in the same visual language — a
   `Sentiment · Confidence` caption row above the framing-notes paragraph, and
   loaded terms as `CategoryChip`-styled pills below it. The disclaimer renders
   where the mockup already puts one ("AI summaries can make mistakes.").
4. **Sidebar percentage rows** (Bias Analysis / Source Breakdown) are a new
   `BiasBreakdownRow` presentation: `label | percent | mini track`. The track is
   a `bg-bias-center` rail with a fill sized to the percentage and coloured by
   segment (left `bias-left`, center a mid grey `#9ca3af`, right `bias-right`).
   Percent text is coloured for left/right and `text-primary` for center,
   matching the reference's red "20%".
5. **Header** — `SiteHeader` gains `showCategories?: boolean` (default `true`,
   so the home page is unchanged); the details page passes `false`.
6. **Interactivity** — Save / Share / More / How We Analyze Bias / Provide
   Feedback / View All Sources / Subscribe are presentational buttons with
   accessible labels and no handlers. The newsletter input is an uncontrolled
   `<input type="email">` inside a non-submitting form. No `"use client"` file
   is introduced.
7. **Images** — every image uses `next/image` with the local placeholder;
   hero is `priority`, thumbnails are not.

## Files likely to change

- `app/news/[slug]/page.tsx` — **new**, the page composition.
- `lib/mock/article.ts` — **new**, `ArticleDetail` type + mock data + lookup.
- `components/analysis-panel.tsx` — **new**, `SidebarCard` shell plus the
  `BiasAnalysisCard`, `AiSummaryCard`, `SourceBreakdownCard` sections.
- `components/bias-breakdown-row.tsx` — **new**, label/percent/mini-track row.
- `components/related-story-card.tsx` — **new**, thumbnail + title + meta.
- `components/newsletter-band.tsx` — **new**, full-width subscribe strip.
- `components/site-header.tsx` — add `showCategories` prop.
- `components/news-card.tsx` — wrap in `next/link` to `/news/{id}`.
- `lib/mock/home.ts` — no shape change; only referenced.

## Implementation requirements

### Page shell

`SiteHeader showCategories={false}` → `<main className="flex-1 bg-bg-primary">`
→ `container-page py-8` → grid → `NewsletterBand` (full container width, below
both columns) → `SiteFooter`.

Grid: `grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start`.
Sidebar is `lg:sticky lg:top-6` only if it does not exceed the viewport — do not
add sticky positioning in v1; keep it a plain column.

### Left column (in order)

1. Kicker — `text-caption text-text-secondary`: `Politics · United States`.
2. `<h1 className="mt-3 text-h1 max-w-[640px]">` — the article title.
3. Byline row — `mt-4 flex flex-wrap items-center gap-x-3 text-body-sm
   text-text-secondary`, items `By David Morgan`, `May 31, 2026`,
   `12 min read` separated by `|` dividers (`text-divider`); right-aligned
   (`ml-auto`) action group: `Save` + `bookmark` icon, `Share` + `share` icon,
   `more` icon button. Each button `type="button"` with an `aria-label`.
4. Hero — `mt-4 relative aspect-[16/9] w-full overflow-hidden rounded-md`,
   `next/image fill object-cover priority`, `sizes="(min-width:1024px) 900px, 100vw"`.
5. Caption — `mt-2 text-caption text-text-secondary`, two lines: description,
   then `Photo: Andrew Harnik/Getty Images`.
6. Bias Distribution box — `mt-6 rounded-md border border-border p-4`: header row
   `text-body-sm font-semibold` + `info` icon (`size={14}`,
   `text-text-secondary`), `BiasMeter size="md"` with `mt-3`,
   `mt-2 text-caption text-text-secondary` `12 sources`.
7. Body — `mt-8 space-y-5 text-body-lg text-text-primary max-w-[70ch]`; each
   mock paragraph in a `<p>`.
8. Related Stories — `mt-10 border-t border-border pt-6`; `text-h4 font-semibold`
   heading; `mt-4 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2` of
   `RelatedStoryCard`, 6 entries, each linking to its own `/news/{slug}`.

`RelatedStoryCard`: `flex gap-3`; thumb
`relative size-[72px] shrink-0 overflow-hidden rounded-sm` (`fill object-cover`,
`sizes="72px"`); text column: `text-caption text-text-secondary` kicker,
`line-clamp-2 text-body-sm font-semibold text-text-primary` title,
`text-caption text-text-secondary` `May 29, 2026 · 8 min read`.

### Right sidebar — three `SidebarCard`s

Shell: `rounded-lg border border-border bg-bg-primary p-5` with a header row —
`text-h4 font-semibold` title on the left, `info` icon (`size={16}`,
`text-text-secondary`) on the right — and `space-y-4` between cards.

**Bias Analysis**
- `text-body-sm font-medium` label `Overall Bias`.
- `text-h2` headline in the dominant segment colour: `Right 49%`.
- `text-body-sm text-bias-right` line `Based on 12 balanced sources`.
- `border-t border-border pt-4` then three `BiasBreakdownRow`s.
- Sentiment/confidence caption row (decision 3): `Sentiment: Neutral ·
  Confidence 82%` in `text-caption text-text-secondary`.
- Framing notes paragraph — `text-body-sm text-text-secondary`.
- Loaded terms — `flex flex-wrap gap-1.5` of small pills
  (`rounded-full border border-border px-2 py-0.5 text-caption`).
- Full-width outlined button `How We Analyze Bias` —
  `w-full rounded-md border border-border py-2 text-body-sm font-medium
  hover:bg-surface`.

**AI Summary**
- `text-caption text-text-secondary` `Generated May 31, 2026 · 3 min read`.
- `<ul className="mt-3 space-y-3 text-body-sm">` of 5 bullets, each
  `flex gap-2` with a `•` marker (`aria-hidden`) and the bullet text.
- Disclaimer `text-caption text-text-secondary` — the mock `disclaimer` string.
- Outlined button `Provide Feedback` (same style as above).

**Source Breakdown**
- `text-body-sm` `12 Total Sources`.
- Three `BiasBreakdownRow`s showing `count (percent%)`, e.g. `2 (20%)`.
- `border-t border-border pt-3` header row `Top Sources` / `Bias`
  (`text-caption text-text-secondary`, `justify-between`).
- Rows: source name `text-body-sm text-text-primary`, bias label right-aligned
  `text-body-sm` coloured `text-bias-left` / `text-text-secondary` /
  `text-bias-right`.
- Outlined button `View All Sources`.

`BiasBreakdownRow` props: `{ label, valueLabel, percent, tone: "left" | "center"
| "right" }`. Layout `flex items-center gap-3 text-body-sm`: label
`w-14 shrink-0`, `valueLabel` `w-20 shrink-0` (tone-coloured for left/right),
track `h-1.5 flex-1 rounded-full bg-bias-center` containing a
`h-full rounded-full` fill with `style={{ width: \`${percent}%\` }}`.

### Newsletter band

`mt-10 rounded-lg border border-border bg-surface p-6`;
`flex flex-col gap-4 md:flex-row md:items-center md:justify-between`; left:
`text-body-lg font-semibold` `Stay Informed. Stay Balanced.` +
`text-body-sm text-text-secondary` subline; right: `flex gap-3` with
`<input type="email" placeholder="Enter your email">`
(`w-full rounded-md border border-border bg-bg-primary px-4 py-2.5 text-body-sm
md:w-64`) and a dark `Subscribe` button matching the header's
(`rounded-md bg-text-primary px-5 py-2.5 text-body-md font-medium text-white`).
The form has `onSubmit`-free markup — a plain `<form>` is fine as long as no
client handler is needed; use `<div>` if any lint rule objects.

### Typography / spacing / colour rules

- Only design-system tokens: no raw hex, no arbitrary colours. The one allowed
  arbitrary value is the mid-grey centre fill (`bg-[#9ca3af]`) and layout
  measurements (`max-w-[640px]`, `size-[72px]`, `max-w-[70ch]`).
- Vertical rhythm on the 4px scale (`mt-2/3/4/6/8/10`).
- Headline `text-h1` (32/1.2/700); sidebar card titles `text-h4` 16/600;
  body copy `text-body-lg` 16/1.6; meta `text-body-sm` 13; labels
  `text-caption` 11.

### Responsiveness

- `< 640px`: single column, related stories stack, newsletter stacks, byline
  actions wrap. Hero stays 16/9.
- `640–1023px`: related stories 2-up; sidebar still below the article.
- `≥ 1024px`: two-column `1fr / 340px` grid.
- No horizontal scrolling at 320px; long titles wrap, never clip.

### Pixel-perfect expectations

- Bias values `Left 20% / Center 31% / Right 49%`, `12 sources`, matching the
  mockup exactly; the distribution bar segment widths are proportional.
- Header shows the utility bar and nav row only — no chip rail.
- Related Stories is exactly 6 items in a 2×3 grid on desktop.
- The footer is byte-identical to the home page's.

## Security requirements

- No secrets, no `NEXT_PUBLIC_*` additions, no network calls, no env access.
- Server components only; no Oxylabs/OpenAI/Supabase imports anywhere in the
  page tree (AGENTS §21).
- No `any`; every component prop is explicitly typed.

## Acceptance criteria

1. `/news/trump-iran-peace-proposal` renders the reference layout end to end.
2. Every home card links to a details page that renders (no 404 for any
   `TOP_NEWS` id); an unknown slug renders the Next.js 404.
3. All §19 details-page fields are visible: summary, sentiment, framing
   percentages, confidence, framing notes, loaded terms, disclaimer.
4. Home page is visually unchanged apart from cards now being links.
5. No console errors or hydration warnings; images use `next/image`.
6. `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

## Checks to run

```bash
npm run typecheck
npm run lint
npm run build
```

## Manual test steps

1. `npm run dev`.
2. Open `http://localhost:3000/` — confirm the home grid is unchanged and each
   card is clickable.
3. Click the first card ("Trump Sends Iran Revised Peace Proposal…") and confirm
   it lands on `http://localhost:3000/news/trump-iran-peace-proposal`.
4. Compare against the reference: kicker, H1, byline + Save/Share/More, hero and
   caption, Bias Distribution bar reading `Left 20% / Center 31% / Right 49%`
   with `12 sources`, 8 body paragraphs, 6 related stories in 2 columns.
5. In the sidebar confirm: Bias Analysis (`Right 49%`, three rows, sentiment +
   confidence, framing notes, loaded terms, `How We Analyze Bias`), AI Summary
   (5 bullets + disclaimer + `Provide Feedback`), Source Breakdown
   (`12 Total Sources`, three rows, 8 top sources with bias labels,
   `View All Sources`).
6. Confirm the newsletter band spans the full container width above the footer.
7. Resize to 1024px, 768px, and 375px — no horizontal scrollbar, sidebar moves
   below the article, related stories reflow.
8. Visit `http://localhost:3000/news/does-not-exist` — Next.js 404 page.
