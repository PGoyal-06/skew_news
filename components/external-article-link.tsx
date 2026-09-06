"use client";

import posthog from "posthog-js";

type ExternalArticleLinkProps = {
  articleId: string;
  href: string;
  sourceName: string;
};

export function ExternalArticleLink({
  articleId,
  href,
  sourceName,
}: ExternalArticleLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline hover:text-text-primary"
      onClick={() =>
        posthog.capture("original_article_opened", {
          article_id: articleId,
          source_name: sourceName,
        })
      }
    >
      Read the original on {sourceName}
    </a>
  );
}
