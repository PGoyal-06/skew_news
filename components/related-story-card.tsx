"use client";

import Image from "next/image";
import Link from "next/link";
import posthog from "posthog-js";

import type { RelatedStoryView } from "@/lib/view/articles";
import { cn } from "@/lib/utils";

type RelatedStoryCardProps = {
  story: RelatedStoryView;
  className?: string;
};

/**
 * Compact related-story row: square thumbnail, 2-line title, source · date.
 *
 * Rendered by `RelatedStories` on the news details page (AGENTS §20).
 */
export function RelatedStoryCard({ story, className }: RelatedStoryCardProps) {
  return (
    <article className={cn("flex gap-3", className)}>
      <div className="relative size-[72px] shrink-0 overflow-hidden rounded-sm">
        <Image
          src={story.imageUrl}
          alt={story.imageAlt}
          fill
          sizes="72px"
          className="object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-caption text-text-secondary">{story.sourceName}</p>
        <h3 className="line-clamp-2 text-body-sm font-semibold text-text-primary">
          <Link
            href={`/news/${story.id}`}
            className="hover:underline"
            onClick={() =>
              posthog.capture("related_article_opened", {
                article_id: story.id,
                source_name: story.sourceName,
                entry_point: "related_stories",
              })
            }
          >
            {story.title}
          </Link>
        </h3>
        <p className="text-caption text-text-secondary">
          {story.publishedLabel} &middot; {story.readTimeLabel}
        </p>
      </div>
    </article>
  );
}
