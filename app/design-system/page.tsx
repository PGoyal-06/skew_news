import type { ReactNode } from "react";

import { ArticleCard } from "@/components/article-card";
import { BiasMeter } from "@/components/bias-meter";
import { Button } from "@/components/ui/button";
import { CategoryChip } from "@/components/category-chip";
import { Icon, ICON_NAMES } from "@/components/icon";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "biasly News — Design System v1.0",
  description: "Tokens, components and layout rules for the biasly News app.",
};

/* -------------------------------------------------------------------------- */
/* Layout primitives (local to the showcase)                                  */
/* -------------------------------------------------------------------------- */

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "col-span-12 rounded-lg border border-border bg-bg-primary p-6",
        className,
      )}
    >
      <h2 className="mb-5 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div>
      <div
        className="h-16 w-full rounded-md border border-border"
        style={{ background: hex }}
      />
      <p className="mt-2 text-body-sm font-medium text-text-primary">{name}</p>
      <p className="text-caption text-text-secondary uppercase">{hex}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const TYPE_SCALE = [
  { cls: "text-h1", role: "Page / Screen Title", size: "32px", weight: "Bold", lh: "1.2" },
  { cls: "text-h2", role: "Section Title", size: "24px", weight: "SemiBold", lh: "1.3" },
  { cls: "text-h3", role: "Card / Module Title", size: "20px", weight: "SemiBold", lh: "1.3" },
  { cls: "text-h4", role: "Subheading", size: "16px", weight: "Medium", lh: "1.4" },
  { cls: "text-body-lg", role: "Important content", size: "16px", weight: "Regular", lh: "1.6" },
  { cls: "text-body-md", role: "Body text", size: "14px", weight: "Regular", lh: "1.6" },
  { cls: "text-body-sm", role: "Supporting text", size: "13px", weight: "Regular", lh: "1.6" },
  { cls: "text-caption", role: "Labels, meta text", size: "11px", weight: "Regular", lh: "1.4" },
] as const;

const SPACING = [
  { cls: "size-1", label: "4px" },
  { cls: "size-2", label: "8px" },
  { cls: "size-4", label: "16px" },
  { cls: "size-6", label: "24px" },
  { cls: "size-8", label: "32px" },
  { cls: "size-10", label: "40px" },
  { cls: "size-16", label: "64px" },
] as const;

const RADII = [
  { cls: "rounded-sm", label: "Small", value: "4px" },
  { cls: "rounded-md", label: "Medium", value: "8px" },
  { cls: "rounded-lg", label: "Large", value: "12px" },
  { cls: "rounded-full", label: "Full", value: "9999px" },
] as const;

const SHADOWS = [
  { cls: "shadow-sm", label: "Small", value: "0 1px 2px rgba(0,0,0,0.05)" },
  { cls: "shadow-md", label: "Medium", value: "0 4px 12px rgba(0,0,0,0.08)" },
  { cls: "shadow-lg", label: "Large", value: "0 12px 24px rgba(0,0,0,0.12)" },
] as const;

const BUTTON_ROWS = [
  { label: "Primary", variant: "primary" as const, hover: "bg-primary/85" },
  { label: "Secondary", variant: "secondary" as const, hover: "bg-surface" },
  { label: "Text", variant: "text" as const, hover: "text-bias-right", noOutline: true },
];

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DesignSystemPage() {
  return (
    <main className="min-h-full bg-bg-secondary py-10">
      <div className="container-page">
        <header className="mb-8">
          <h1 className="text-h1">biasly News — Design System</h1>
          <p className="mt-1 text-body-lg text-text-secondary">
            Balanced news coverage, powered by AI. Version 1.0 — the shared token
            and component layer every screen is built from.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* ---------------------------------------------------------------- */}
          {/* Brand                                                          */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Brand" className="lg:col-span-4">
            <div className="rounded-md bg-surface p-6 text-center">
              <p className="text-[40px] leading-none font-bold tracking-tight text-text-primary">
                biasly
              </p>
              <p className="mt-1 text-body-md font-medium text-text-secondary">
                News
              </p>
            </div>
            <p className="mt-4 text-body-md text-text-secondary">
              Balanced news coverage, powered by AI.
            </p>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Typography                                                      */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Typography" className="lg:col-span-8">
            <div className="mb-6 flex flex-col gap-1 border-b border-divider pb-6">
              <p className="text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
                Font family
              </p>
              <p className="text-h1 font-bold text-text-primary">Poppins</p>
              <p className="max-w-md text-body-md text-text-secondary">
                A modern geometric sans-serif that keeps headlines and dense body
                copy legible at every size in the scale.
              </p>
            </div>

            <div className="flex flex-col divide-y divide-divider">
              {TYPE_SCALE.map((t) => (
                <div
                  key={t.cls}
                  className="grid grid-cols-1 items-baseline gap-2 py-3 sm:grid-cols-[1fr_auto]"
                >
                  <span className={cn(t.cls, "text-text-primary")}>
                    {t.role}
                  </span>
                  <span className="text-caption text-text-secondary tabular-nums">
                    {t.size} · {t.weight} · {t.lh}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Colors                                                          */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Colors" className="lg:col-span-4">
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
                  Primary
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Swatch name="Text Primary" hex="#0D0D0F" />
                  <Swatch name="Text Secondary" hex="#6B7280" />
                  <Swatch name="Surface" hex="#F6F6F6" />
                </div>
              </div>
              <div>
                <p className="mb-3 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
                  Semantic
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Swatch name="Left Bias" hex="#B42318" />
                  <Swatch name="Center" hex="#E5E7EB" />
                  <Swatch name="Right Bias" hex="#1D4ED8" />
                </div>
              </div>
              <div>
                <p className="mb-3 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
                  Neutrals
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Swatch name="BG Primary" hex="#FFFFFF" />
                  <Swatch name="BG Secondary" hex="#F0F0F0" />
                  <Swatch name="Border" hex="#E5E7EB" />
                  <Swatch name="Divider" hex="#E5E7EB" />
                </div>
              </div>
            </div>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* UI Elements                                                     */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="UI Elements" className="lg:col-span-8">
            {/* Buttons */}
            <p className="mb-3 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
              Buttons
            </p>
            <div className="overflow-x-auto">
              <div className="grid min-w-[520px] grid-cols-[80px_repeat(4,1fr)] items-center gap-x-4 gap-y-3">
                <span />
                {["Default", "Hover", "Outline", "Disabled"].map((h) => (
                  <span
                    key={h}
                    className="text-caption text-text-secondary"
                  >
                    {h}
                  </span>
                ))}

                {BUTTON_ROWS.map((row) => (
                  <FragmentRow key={row.label} label={row.label}>
                    <Button variant={row.variant}>Button</Button>
                    <Button variant={row.variant} className={row.hover}>
                      Button
                    </Button>
                    {row.noOutline ? (
                      <span className="text-body-md text-text-secondary">—</span>
                    ) : (
                      <Button variant="outline">Button</Button>
                    )}
                    {row.noOutline ? (
                      <span className="text-body-md text-text-secondary">—</span>
                    ) : (
                      <Button variant={row.variant} disabled>
                        Button
                      </Button>
                    )}
                  </FragmentRow>
                ))}
              </div>
            </div>

            {/* Chips */}
            <p className="mt-8 mb-3 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
              Chip / Category
            </p>
            <div className="flex flex-wrap gap-2">
              <CategoryChip label="World Cup" addable />
              <CategoryChip label="IPL" addable />
              <CategoryChip label="Business & Markets" addable />
              <CategoryChip label="More" addable />
              <CategoryChip label="Following" selected />
            </div>

            {/* Bias meter */}
            <p className="mt-8 mb-3 text-caption font-semibold tracking-[0.14em] text-text-secondary uppercase">
              Bias Meter
            </p>
            <BiasMeter left={25} center={50} right={25} showScale />
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Icons                                                           */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Icons" className="lg:col-span-6">
            <div className="grid grid-cols-5 gap-3">
              {ICON_NAMES.map((name) => (
                <div
                  key={name}
                  className="flex aspect-square items-center justify-center rounded-md border border-border text-text-primary"
                >
                  <Icon name={name} />
                </div>
              ))}
            </div>
            <p className="mt-4 text-body-sm text-text-secondary">
              Line style · 2px stroke · Rounded caps
            </p>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Card example                                                    */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Card Example" className="lg:col-span-6">
            <ArticleCard
              imageUrl="/placeholder-article.png"
              imageAlt="Placeholder article image"
              category="Politics"
              location="United States"
              title="Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report"
              summary="The proposal includes stricter limits on uranium enrichment and enhanced verification measures."
              bias={{ left: 25, center: 50, right: 49 }}
              publishedLabel="2h ago"
              readTimeLabel="12 min read"
            />
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Spacing                                                         */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Spacing System" className="lg:col-span-12">
            <div className="flex flex-wrap items-end gap-6">
              {SPACING.map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-2">
                  <div className={cn(s.cls, "rounded-sm bg-bias-right/15")} />
                  <span className="text-caption text-text-secondary tabular-nums">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-body-sm text-text-secondary">
              Consistent scale based on a 4px base unit.
            </p>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Grid                                                            */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Grid System" className="lg:col-span-7">
            <div className="grid grid-cols-12 gap-6 rounded-md bg-surface p-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-sm bg-bias-right/15"
                />
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-4">
              {[
                ["Container", "1280px"],
                ["Columns", "12"],
                ["Gutter", "24px"],
                ["Margin", "24px"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="font-medium text-text-primary tabular-nums">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Shadows                                                         */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Shadows" className="lg:col-span-5">
            <div className="space-y-4">
              {SHADOWS.map((s) => (
                <div key={s.label} className="flex items-center gap-4">
                  <div
                    className={cn(
                      "size-16 shrink-0 rounded-md bg-bg-primary",
                      s.cls,
                    )}
                  />
                  <div>
                    <p className="text-body-sm font-medium text-text-primary">
                      {s.label}
                    </p>
                    <p className="text-caption text-text-secondary">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* ---------------------------------------------------------------- */}
          {/* Border radius                                                   */}
          {/* ---------------------------------------------------------------- */}
          <Panel title="Border Radius" className="lg:col-span-12">
            <div className="flex flex-wrap gap-6">
              {RADII.map((r) => (
                <div key={r.label} className="flex items-center gap-4">
                  <div
                    className={cn(
                      "size-16 shrink-0 border border-border bg-surface",
                      r.cls,
                    )}
                  />
                  <div>
                    <p className="text-body-sm font-medium text-text-primary">
                      {r.label}
                    </p>
                    <p className="text-caption text-text-secondary tabular-nums">
                      {r.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="mt-10 bg-text-primary py-6 text-bg-primary">
        <div className="container-page flex flex-col gap-2 text-body-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">
            biasly <span className="font-normal opacity-70">News</span>
          </span>
          <span className="opacity-70">
            Design System v1.0 · Balanced news coverage, powered by AI.
          </span>
          <span className="opacity-70">Stay consistent. Stay unbiased.</span>
        </div>
      </footer>
    </main>
  );
}

/** A labelled row inside the button matrix grid. */
function FragmentRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <span className="text-body-sm text-text-secondary">{label}</span>
      {children}
    </>
  );
}
