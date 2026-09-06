import { NewsCard } from "@/components/news-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DEFAULT_ARTICLE_PAGE_SIZE } from "@/lib/supabase/limits";
import { getAnalyzedArticles } from "@/lib/supabase/queries/articles";
import { toCardView } from "@/lib/view/articles";

// Reads the database on every request; there is nothing to prerender at build
// time, and the feed changes whenever the pipeline inserts an analysis.
export const dynamic = "force-dynamic";

const Home = async () => {
  const articles = await getAnalyzedArticles({
    limit: DEFAULT_ARTICLE_PAGE_SIZE,
  });
  const cards = articles.map((article) => toCardView(article));

  return (
    <>
      <SiteHeader />

      <main className="flex-1 bg-bg-primary">
        <div className="container-page py-8">
          <h1 className="text-h2">Top News</h1>

          {cards.length === 0 ? (
            <p className="mt-6 text-body-md text-text-secondary">
              No analyzed articles yet.
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((article, index) => (
                <NewsCard
                  key={article.id}
                  article={article}
                  priority={index < 3}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  );
};

export default Home;
