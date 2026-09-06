import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import { notFound } from "next/navigation";

import { AnalysisPanel } from "@/components/analysis-panel";
import { BiasMeter } from "@/components/bias-meter";
import { ExternalArticleLink } from "@/components/external-article-link";
import { Icon } from "@/components/icon";
import { NewsletterBand } from "@/components/newsletter-band";
import { RelatedStories } from "@/components/related-stories";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getArticleById,
  getArticleEmbedding,
  getRelatedArticles,
} from "@/lib/supabase/queries/articles";
import { toDetailView, toRelatedView } from "@/lib/view/articles";

// Per-request read; the analysis for an article can change between visits.
export const dynamic = "force-dynamic";

const Divider = () => (
  <span aria-hidden className="text-divider">
    |
  </span>
);

export default async function NewsDetailsPage(
  props: PageProps<"/news/[slug]">,
) {
  const { slug } = await props.params;

  // The full analysis is sign-in only. Guarded here, in the resource itself,
  // rather than by path matching in the proxy — and before any data is read.
  await auth.protect();

  // `slug` is the article id: no slug column exists (AGENTS §7).
  const record = await getArticleById(slug);

  if (!record) {
    notFound();
  }

  const article = toDetailView(record);

  // Related Stories are similarity-ranked in Postgres (§20). An article with no
  // embedding — not yet backfilled — has nothing to compare, so the section is
  // simply absent rather than empty.
  const embedding = await getArticleEmbedding(record.id);
  const related = embedding
    ? (await getRelatedArticles(record.id, embedding)).map((row) =>
        toRelatedView(row),
      )
    : [];

  return (
    <>
      <SiteHeader showCategories={false} />

      <main className="flex-1 bg-bg-primary">
        <div className="container-page py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <article>
              <p className="text-caption text-text-secondary">
                {article.sourceName}
              </p>

              <h1 className="mt-3 max-w-[640px] text-h1 text-text-primary">
                {article.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm text-text-secondary">
                <span>{article.publishedLabel}</span>
                <Divider />
                <span>{article.readTimeLabel}</span>

                <div className="ml-auto flex items-center gap-4">
                  <button
                    type="button"
                    aria-label="Save this article"
                    className="inline-flex items-center gap-1.5 text-text-primary transition-opacity hover:opacity-70"
                  >
                    Save
                    <Icon name="bookmark" size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Share this article"
                    className="inline-flex items-center gap-1.5 text-text-primary transition-opacity hover:opacity-70"
                  >
                    Share
                    <Icon name="share" size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="More options"
                    className="text-text-primary transition-opacity hover:opacity-70"
                  >
                    <Icon name="more" size={18} />
                  </button>
                </div>
              </div>

              <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-md">
                <Image
                  src={article.imageUrl}
                  alt={article.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 900px, 100vw"
                  priority
                  className="object-cover"
                />
              </div>

              <section className="mt-6 rounded-md border border-border p-4">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-body-sm font-semibold text-text-primary">
                    Bias Distribution
                  </h2>
                  <span className="text-text-secondary">
                    <Icon name="info" size={14} />
                  </span>
                </div>

                <BiasMeter
                  size="md"
                  left={article.bias.left}
                  center={article.bias.center}
                  right={article.bias.right}
                  className="mt-3"
                />

                <p className="mt-2 text-caption text-text-secondary">
                  AI-estimated framing of this article &middot;{" "}
                  <ExternalArticleLink
                    articleId={article.id}
                    href={article.originalUrl}
                    sourceName={article.sourceName}
                  />
                </p>
              </section>

              <div className="mt-8 max-w-[70ch] space-y-5 text-body-lg text-text-primary">
                {article.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <RelatedStories stories={related} />
            </article>

            <AnalysisPanel article={article} />
          </div>

          <NewsletterBand />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
