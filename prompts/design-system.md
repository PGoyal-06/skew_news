# Prompt: biasly Design System (tokens + components + showcase)

## Goal

Implement the biasly **app design system** from the attached UI reference sheet so
every later feature (home cards, news‑details page, auth UI) is built from one
shared token + component layer.

Deliver three layers:

1. **Tokens** — colors, typography scale, spacing, radius, shadows, and the
   12‑column / 1280px grid, wired into Tailwind v4 via `@theme` in
   `app/globals.css` and the Poppins font via `next/font`.
2. **Components** — the primitives shown on the sheet: `Button` (4 variants ×
   states), `CategoryChip`, `BiasMeter`, `ArticleCard`, plus a thin icon wrapper
   over `lucide-react` (the sheet's "line style · 2px stroke · rounded caps"
   spec matches lucide exactly).
3. **Showcase route** — `/design-system` renders the reference sheet section by
   section for visual review.

This is **presentational only**. No Supabase, Clerk, Oxylabs, AI, API routes, or
data fetching. Static UI that will later consume stored data.

## Skills / docs read

- `AGENTS.md` (full) — workflow §2, prompt spec §4, stack §6 (shadcn/ui
  mandated), "do not overbuild", security §21, checks §22.
- `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` — `next/font/google`,
  non‑variable fonts need explicit `weight` array.
- `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` — Tailwind v4
  is the default path (`@import "tailwindcss"`), global CSS + `@theme` in
  `app/globals.css` imported once from the root layout.
- Tailwind v4 / shadcn/ui: per AGENTS §3 use package docs + existing project
  patterns; there are no existing component patterns yet, so shadcn's Tailwind‑v4
  output is the baseline.

## Existing code inspected

- `package.json` — Next `16.3.4`, React `19.2.8`, `tailwindcss ^4`,
  `@tailwindcss/postcss ^4`. Scripts: `dev`, `build`, `start`, `lint`.
  **No `typecheck` script** (AGENTS §22 expects one).
- `app/layout.tsx` — starter: Geist + Geist_Mono, `metadata` = "Create Next App",
  `LayoutProps<"/">` typed root layout, `<body className="min-h-full flex flex-col">`.
- `app/globals.css` — starter: `@import "tailwindcss"`, `--background/--foreground`
  tokens, `@theme inline` with `--color-*` + `--font-sans/mono`, a
  `@media (prefers-color-scheme: dark)` block, `body { font-family: Arial… }`.
- `app/page.tsx` — stub `Home` returning `<div>Home</div>` (already modified
  before this task; **left untouched** — showcase lives at its own route).
- `tsconfig.json` — path alias `@/*` → `./*` (shadcn‑compatible).
- `eslint.config.mjs` — flat config, `eslint-config-next` core‑web‑vitals + TS.
- `next.config.ts` — empty config.
- No `components/`, `lib/`, `prompts/`, `components.json`, or `.env*`.

## Decisions / assumptions

1. **shadcn/ui as the component base** (user‑confirmed, matches AGENTS §6).
   Initialize shadcn for Tailwind v4 / React 19; use its `Button`, `Card`, `Badge`
   as bases and **restyle to biasly tokens** via their `cva` config. Do not pull
   in components the sheet doesn't show.
2. **Light mode only** (user‑confirmed). Remove the starter's
   `prefers-color-scheme: dark` block; do not add `.dark` token overrides.
3. **Scope = tokens + components + showcase** (user‑confirmed).
4. **Icons: `lucide-react`** — it is shadcn's default icon dep and already matches
   the sheet's 2px‑stroke rounded‑cap line style. A tiny `Icon` wrapper fixes
   default size (`20`) and `strokeWidth` (`2`). No hand‑rolled SVG set.
5. **`Text Secondary` hex** — the sheet reads `#6B72B0` but that is almost
   certainly `#6B7280` (Tailwind slate‑500, consistent with the neutral ramp).
   Using **`#6B7280`**; flag on review if the sheet really means `#6B72B0`.
6. **`Right Bias` hex** — using **`#1D4ED8`** (Tailwind blue‑700) as printed.
7. **BiasMeter normalization** — AGENTS §19 requires L+C+R to sum to 100, but the
   sheet's card example prints `25 / 50 / 49` (=124). The component renders each
   segment width as `value / (l+c+r)` so it always fills the track regardless of
   rounding. Labels show the raw integer percentages passed in.
8. **Showcase page is a Server Component**; all new components are pure
   presentational and need **no `"use client"`** (no hooks, no handlers). The
   `Button` stays a plain styled `<button>` / Radix `Slot` like shadcn ships it.
9. **`app/page.tsx` unchanged.** Optionally add a one‑line link to
   `/design-system` — only if it doesn't disturb the existing stub. Default: leave
   it.
10. Add `"typecheck": "tsc --noEmit"` to `package.json` scripts (AGENTS §22).
11. shadcn writes its own token names into `globals.css` (`--background`,
    `--primary`, `--radius`, …). Keep the shadcn‑required names it needs to
    function, but **set their values from biasly tokens** and add the biasly‑named
    tokens (`--color-text-primary`, `--color-bias-left`, `--text-h1`, …) as the
    canonical set used by app code.

## Token spec (from the reference sheet)

### Color

| Token                     | Value     | Tailwind utility            |
| ------------------------- | --------- | --------------------------- |
| `--color-text-primary`    | `#0D0D0F` | `text-text-primary`         |
| `--color-text-secondary`  | `#6B7280` | `text-text-secondary`       |
| `--color-surface`         | `#F6F6F6` | `bg-surface`                |
| `--color-bias-left`       | `#B42318` | `bg-bias-left`              |
| `--color-bias-center`     | `#E5E7EB` | `bg-bias-center`            |
| `--color-bias-right`      | `#1D4ED8` | `bg-bias-right`             |
| `--color-bg-primary`      | `#FFFFFF` | `bg-bg-primary`             |
| `--color-bg-secondary`    | `#F0F0F0` | `bg-bg-secondary`           |
| `--color-border`          | `#E5E7EB` | `border-border`             |
| `--color-divider`         | `#E5E7EB` | `divide-divider` / `border` |

### Typography — family `Poppins`, fallback `ui-sans-serif, system-ui, sans-serif`

| Token          | Size | Weight        | Line height | Role                |
| -------------- | ---- | ------------- | ----------- | ------------------- |
| `text-h1`      | 32px | 700 Bold      | 1.2         | Page / screen title |
| `text-h2`      | 24px | 600 SemiBold  | 1.3         | Section title       |
| `text-h3`      | 20px | 600 SemiBold  | 1.3         | Card / module title |
| `text-h4`      | 16px | 500 Medium    | 1.4         | Subheading          |
| `text-body-lg` | 16px | 400 Regular   | 1.6         | Important content   |
| `text-body-md` | 14px | 400 Regular   | 1.6         | Body text           |
| `text-body-sm` | 13px | 400 Regular   | 1.6         | Supporting text     |
| `text-caption` | 11px | 400 Regular   | 1.4         | Labels, meta text   |

Load Poppins weights `["400","500","600","700"]`, `display: "swap"`, exposed as
`--font-poppins` and set as `--font-sans` inside `@theme`.

### Spacing — 4px base unit

`--spacing: 4px` (Tailwind v4 spacing multiplier). Named steps used by the
showcase: `4, 8, 16, 24, 32, 40, 64` px → `1, 2, 4, 6, 8, 10, 16` in scale units.

### Radius

`--radius-sm: 4px` · `--radius-md: 8px` · `--radius-lg: 12px` · `--radius-full: 9999px`.

### Shadow

| Token         | Value                          |
| ------------- | ------------------------------ |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)`   |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)`  |
| `--shadow-lg` | `0 12px 24px rgba(0,0,0,0.12)` |

### Grid

Container `max-width: 1280px`, 12 columns, `24px` gutter, `24px` outer margin.
Provide a `container-page` utility: `width:100%; max-width:1280px; margin-inline:auto;
padding-inline:24px`. Grid demos use `grid-cols-12 gap-6`.

## Files to change / create

**Config / setup**

- `package.json` — add `"typecheck": "tsc --noEmit"`; shadcn init adds
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  `tw-animate-css` (or `tailwindcss-animate`).
- `components.json` — new (shadcn, style "new-york", RSC true, base color slate,
  `@/components`, `@/lib/utils`, css `app/globals.css`).
- `lib/utils.ts` — new (`cn()` = `twMerge(clsx(...))`).

**Tokens**

- `app/globals.css` — rewrite: `@import "tailwindcss"` (+ shadcn's animate
  import), `@theme` with the full biasly token set above, light‑only `:root`,
  `body` → `bg-bg-secondary` / `text-text-primary` / Poppins, `container-page`
  utility. Remove dark `@media` block and the `Arial` body font.
- `app/layout.tsx` — swap Geist → `Poppins` (`--font-poppins`), update `metadata`
  to `"biasly News"` + tagline, keep `LayoutProps<"/">` and body classes.

**Components** (`components/`)

- `components/ui/button.tsx` — shadcn Button; `cva` variants restyled:
  - `primary` (= default): `bg-text-primary text-white`, hover `bg-black/85`,
    disabled `bg-bg-secondary text-text-secondary/60`.
  - `secondary`: `bg-bg-primary text-text-primary border border-border`, hover
    `bg-surface`, disabled muted.
  - `outline`: transparent + `border-border`, hover `border-text-primary bg-surface`.
  - `text` (= ghost/link): no bg, `text-text-primary`, hover `text-bias-right`;
    no outline/disabled treatment on the sheet ("—").
  - Radius `rounded-md` (8px), `text-body-md font-medium`, size `sm` + `md`.
- `components/ui/card.tsx` — shadcn Card primitive (base for ArticleCard).
- `components/category-chip.tsx` — pill: `rounded-full border border-border
  bg-bg-primary text-body-sm px-3 py-1.5`, optional trailing `+` (`Plus` icon,
  14px), `selected` state → `bg-text-primary text-white`. `aria-pressed`.
- `components/bias-meter.tsx` — props `{ left, center, right, size?: "sm"|"md",
  showScale?: boolean }`. Flex track, `rounded-sm`, `h-7` (`md`) / `h-5` (`sm`),
  three segments width `value/(l+c+r)`, colors `bias-left/center/right`, label
  `"{Label} {value}%"` (white on L/R, `text-primary` on center),
  `text-caption`. `showScale` renders `0% · 50% · 100%` under the track.
  `role="img"` + descriptive `aria-label`.
- `components/article-card.tsx` — props `{ imageUrl, imageAlt, category,
  location, title, summary, bias:{left,center,right}, publishedLabel,
  readTimeLabel }`. Layout: `bg-bg-primary border border-border rounded-lg
  shadow-sm p-4`, image left (`sm:w-40 aspect-square rounded-md object-cover`,
  stacks on top `<640px`), content column: caption row `"{category} · {location}"`
  + circled `Info` icon top‑right, `h3` title (clamp 2 lines), `text-body-md
  text-text-secondary` summary (clamp 2), `<BiasMeter size="sm" />`, meta row
  `Clock` + `publishedLabel` · `Bookmark` + `readTimeLabel` in `text-body-sm
  text-text-secondary`. Use `next/image`.
- `components/icon.tsx` — re‑export `lucide-react` icons through a wrapper that
  defaults `size={20}` `strokeWidth={2}`; export the sheet's set: `Menu, Search,
  Bookmark, Clock, Info, Share2, ExternalLink, Calendar, BarChart3, Tag, User,
  Bell, SlidersHorizontal, CheckCircle2, MoreHorizontal, Plus, ChevronDown`.

**Showcase**

- `app/design-system/page.tsx` — Server Component. Sections in sheet order,
  each in a bordered white panel on the `bg-bg-secondary` canvas, laid out with
  `container-page` + responsive `grid-cols-12`:
  1. **Brand** — logo lockup ("biasly" 700 + "News"), tagline.
  2. **Colors** — swatch grid for Primary / Semantic / Neutrals with name + hex.
  3. **Typography** — Poppins specimen + a row per scale token showing live text,
     size, weight, line height.
  4. **UI Elements** — Buttons matrix (rows primary/secondary/text × columns
     default/hover(:hover note)/outline/disabled), Chip row
     (`World Cup +`, `IPL +`, `Business & Markets +`, `More +`), full BiasMeter
     `25 / 50 / 25` with scale.
  5. **Icons** — the icon set in a grid with the "Line style · 2px stroke ·
     Rounded caps" caption.
  6. **Card Example** — one `ArticleCard` with the sheet's Trump/Iran copy and
     `bias={left:25,center:50,right:49}`, `2h ago`, `12 min read`.
  7. **Spacing** — bars for 4/8/16/24/32/40/64 with a "4px base unit" caption.
  8. **Grid** — 12 translucent columns + labels: Container 1280px, Columns 12,
     Gutter 24px, Margin 24px.
  9. **Shadows** — three tiles (`shadow-sm/md/lg`) with the CSS value.
  10. **Border Radius** — four tiles (`sm/md/lg/full`) with px value.
  - Footer bar: dark (`bg-text-primary text-white`), "biasly News", tagline,
    "Design System v1.0", "Stay consistent. Stay unbiased."

## Implementation requirements

- TypeScript throughout, explicit prop types, no `any` (AGENTS §21).
- No `"use client"` unless a component genuinely needs it (none here).
- Keep components small and presentational; no business logic, no data access
  (AGENTS §5, §21).
- All visual values come from tokens/utilities — **no raw hex or px literals in
  component JSX** except inside the token definitions in `globals.css` and the
  showcase's illustrative labels.
- `cn()` from `@/lib/utils` for conditional classes.
- Icons only via `@/components/icon`.
- Responsive: showcase panels reflow at `sm` / `lg`; `ArticleCard` stacks under
  `640px`; horizontal scroll never appears on the page body.
- Preserve the `LayoutProps<"/">` root‑layout signature from the starter.
- Do not touch `AGENTS.md` (regenerated by `next dev`) or `app/page.tsx`.

## Security requirements

- Pure static UI: no secrets, env vars, network calls, server actions, or
  `dangerouslySetInnerHTML`.
- No new environment variables; `.env.example` unchanged.
- Server/client boundary preserved — nothing in `components/` imports server-only
  modules; nothing runs Oxylabs/OpenAI/Supabase (N/A here, but keep it clean).
- `next/image` `src` values in the showcase are local/static placeholders only;
  add any remote host to `next.config.ts` `images.remotePatterns` only if a real
  remote image is used (prefer a local placeholder in `public/`).

## Acceptance criteria

- `app/globals.css` `@theme` exposes every token in the **Token spec** table with
  the exact values listed; dark `@media` block removed.
- `app/layout.tsx` loads Poppins (weights 400/500/600/700) and `metadata.title`
  is `biasly News …`.
- `Button` renders all four variants and a visibly distinct `disabled` state for
  primary/secondary/outline; `text` variant turns `bias-right` blue on hover.
- `CategoryChip` renders label + optional `+`, with a `selected` (inverted) state.
- `BiasMeter` fills its track for any positive `left/center/right`, labels show
  the passed integers, `showScale` renders `0/50/100`.
- `ArticleCard` matches the sheet: image, `category · location`, circled info
  icon, H3 title, secondary summary, compact bias meter, `clock`/`bookmark` meta.
- `/design-system` renders all 10 sections + footer, uses `container-page`
  (1280 / 24px), and has no horizontal body scroll at 375px, 768px, 1440px.
- `npm run typecheck` and `npm run lint` pass clean.
- `npm run build` succeeds (new route + globals + layout changed).
- No raw hex/px in component JSX (grep check); no unintended `"use client"`.

## Checks to run (AGENTS §22)

```
npm run typecheck      # tsc --noEmit  (script added by this change)
npm run lint           # eslint
npm run build          # routes + globals + layout changed
```

Report exact output for each; do not claim a pass without running it.

## Manual test steps

1. `npm run dev`
2. Open `http://localhost:3000/design-system`.
3. Verify against the reference sheet, section by section:
   - Colors: sampled swatches equal the hex labels (`#0D0D0F`, `#B42318`,
     `#1D4ED8`, `#F0F0F0`, …).
   - Typography: H1 = 32px Poppros… Poppins Bold; Caption = 11px; the specimen
     word "Poppins" renders in Poppins (not a system fallback — check Network for
     the woff2, or DevTools Computed → font-family).
   - Buttons: hover the primary/secondary/outline/text buttons; `text` hover is
     blue `#1D4ED8`; disabled buttons show the muted grey and don't depress.
   - Chips: `World Cup +` etc. are full‑radius pills with a `+`.
   - Bias Meter: standalone meter reads `Left 25% / Center 50% / Right 25%` with
     `0% · 50% · 100%` beneath; card meter reads `… Right 49%` and still fills.
   - Card: image left on desktop, stacked on top below 640px; info icon circled
     top‑right; title clamps to 2 lines.
   - Spacing / Grid / Shadows / Radius tiles show the labelled values; grid shows
     12 columns within a 1280px container with 24px gutters/margins.
4. Resize to 375px and 1440px — confirm no horizontal scrollbar on `<body>`.
5. `npm run build && npm run start`, reload `/design-system` — identical render.

## Out of scope

Home page, news‑details page, Clerk, Supabase, Oxylabs, AI analysis, API routes,
cron, pgvector, real data. Those are separate prompts.
