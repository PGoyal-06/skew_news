import type { ReactNode } from "react";

import { BiasBreakdownRow } from "@/components/bias-breakdown-row";
import { Icon } from "@/components/icon";
import {
  biasHeadline,
  type ArticleDetailView,
  type BiasTone,
} from "@/lib/view/articles";
import { cn } from "@/lib/utils";

const TONE_TEXT: Record<BiasTone, string> = {
  left: "text-bias-left",
  center: "text-text-secondary",
  right: "text-bias-right",
};

const TONE_LABEL: Record<BiasTone, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
};

const TONES: BiasTone[] = ["left", "center", "right"];

type SidebarCardProps = {
  title: string;
  /** Tooltip affordance in the card header — presentational. */
  infoLabel: string;
  children: ReactNode;
};

function SidebarCard({ title, infoLabel, children }: SidebarCardProps) {
  return (
    <section className="rounded-lg border border-border bg-bg-primary p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-h4 font-semibold text-text-primary">{title}</h2>
        <button
          type="button"
          aria-label={infoLabel}
          className="shrink-0 text-text-secondary transition-colors hover:text-text-primary"
        >
          <Icon name="info" size={16} />
        </button>
      </div>
      {children}
    </section>
  );
}

function PanelButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="mt-4 w-full rounded-md border border-border py-2 text-body-sm font-medium text-text-primary transition-colors hover:bg-surface"
    >
      {label}
    </button>
  );
}

/**
 * Bias Analysis — headline framing plus the AGENTS §19 analysis fields the
 * mockup does not draw explicitly (sentiment, confidence, loaded terms).
 *
 * The figure describes how THIS article frames the story. skew stores one
 * article per source, so there is no cross-source aggregation to report here.
 */
function BiasAnalysisCard({ article }: { article: ArticleDetailView }) {
  const headline = biasHeadline(article.bias, article.biasLabel);

  return (
    <SidebarCard title="Bias Analysis" infoLabel="How bias analysis works">
      <p className="mt-4 text-body-sm font-medium text-text-primary">
        Overall Bias
      </p>
      <p className={cn("mt-1 text-h2", TONE_TEXT[headline.tone])}>
        {headline.label} {headline.percent}%
      </p>
      <p className="mt-1 text-body-sm text-text-secondary">
        AI-estimated framing of this {article.sourceName} article
      </p>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        {TONES.map((tone) => (
          <BiasBreakdownRow
            key={tone}
            label={TONE_LABEL[tone]}
            valueLabel={`${article.bias[tone]}%`}
            percent={article.bias[tone]}
            tone={tone}
          />
        ))}
      </div>

      <p className="mt-4 text-caption text-text-secondary">
        Sentiment: {article.sentimentLabel} &middot; Confidence{" "}
        {Math.round(article.confidence * 100)}%
      </p>

      {article.framingNotes ? (
        <p className="mt-2 text-body-sm text-text-secondary">
          {article.framingNotes}
        </p>
      ) : null}

      {article.loadedTerms.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {article.loadedTerms.map((term) => (
            <li
              key={term}
              className="rounded-full border border-border px-2 py-0.5 text-caption text-text-secondary"
            >
              {term}
            </li>
          ))}
        </ul>
      ) : null}

      <PanelButton label="How We Analyze Bias" />
    </SidebarCard>
  );
}

function AiSummaryCard({ article }: { article: ArticleDetailView }) {
  const { summaryLines } = article;

  return (
    <SidebarCard title="AI Summary" infoLabel="How the AI summary is generated">
      <p className="mt-3 text-caption text-text-secondary">
        {article.summaryGeneratedLabel} &middot; {article.summaryReadTimeLabel}
      </p>

      {summaryLines.length > 1 ? (
        <ul className="mt-3 space-y-3 text-body-sm text-text-primary">
          {summaryLines.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-text-secondary">
                &bull;
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-body-sm text-text-primary">{summaryLines[0]}</p>
      )}

      <p className="mt-4 text-caption text-text-secondary">
        {article.disclaimer}
      </p>

      <PanelButton label="Provide Feedback" />
    </SidebarCard>
  );
}

/** The details-page right rail: bias analysis and AI summary. */
export function AnalysisPanel({ article }: { article: ArticleDetailView }) {
  return (
    <aside aria-label="AI analysis" className="space-y-4">
      <BiasAnalysisCard article={article} />
      <AiSummaryCard article={article} />
    </aside>
  );
}
