"use client";

import Image from "next/image";
import Link from "next/link";
import posthog from "posthog-js";

import type { ArticleCardView } from "@/lib/view/articles";
import { BiasMeter } from "@/components/bias-meter";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

type NewsCardProps = {
  article: ArticleCardView;
  /** Eager-load the cover image for cards above the fold. */
  priority?: boolean;
  className?: string;
};

/**
 * The home-grid card: cover image on top, framing meter and publish date below.
 * (The horizontal `ArticleCard` remains the design-system sheet's variant.)
 */
export function NewsCard({ article, priority = false, className }: NewsCardProps) {
  const { id, title, sourceName, imageUrl, imageAlt, publishedLabel, bias } =
    article;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-border bg-bg-primary shadow-sm",
        className,
      )}
    >
      <div className="relative aspect-[16/10] w-full">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          className="object-cover"
        />
        <button
          type="button"
          aria-label={`Why this coverage is rated left ${bias.left}%, center ${bias.center}%, right ${bias.right}%`}
          className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-bg-primary/80 text-text-primary backdrop-blur-sm"
        >
          <Icon name="info" size={14} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-caption text-text-secondary">{sourceName}</p>

        <h3 className="mt-2 line-clamp-3 text-h4 leading-snug font-semibold text-text-primary">
          <Link
            href={`/news/${id}`}
            className="hover:underline"
            onClick={() =>
              posthog.capture("article_opened", {
                article_id: id,
                source_name: sourceName,
                entry_point: "top_news_feed",
              })
            }
          >
            {title}
          </Link>
        </h3>

        <BiasMeter
          size="sm"
          left={bias.left}
          center={bias.center}
          right={bias.right}
          className="mt-4"
        />

        <p className="mt-3 text-body-sm text-text-secondary">{publishedLabel}</p>
      </div>
    </article>
  );
}
