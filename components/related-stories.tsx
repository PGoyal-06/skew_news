import { RelatedStoryCard } from "@/components/related-story-card";
import type { RelatedStoryView } from "@/lib/view/articles";

type RelatedStoriesProps = {
  stories: RelatedStoryView[];
};

/**
 * Related Stories on the news details page (AGENTS §20).
 *
 * The list is already ranked by cosine similarity to the current article; this
 * component only renders it. Nothing is shown when there is nothing similar —
 * an empty heading would read as a loading state.
 */
export function RelatedStories({ stories }: RelatedStoriesProps) {
  if (stories.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="text-h3 text-text-primary">Related Stories</h2>

      <p className="mt-1 text-caption text-text-secondary">
        Similar coverage, matched by AI on what the articles are about.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {stories.map((story) => (
          <RelatedStoryCard key={story.id} story={story} />
        ))}
      </div>
    </section>
  );
}
