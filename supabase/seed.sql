-- skew / biasly — source seed data.
--
-- HOW TO APPLY: run supabase/schema.sql first, then paste this file into the
-- Supabase Dashboard → SQL Editor and Run.
--
-- These are the five outlets AGENTS.md §11 names in its URL-rejection examples.
-- Every listing_url is a HOMEPAGE ENTRY PAGE (§9, §11) — never a section,
-- category, or topic path. The scraper extracts story-card links from these
-- pages and never crawls into sublinks to find more listing pages.
--
-- INSERT-ONLY AND IDEMPOTENT: `on conflict (listing_url) do nothing` means
-- re-running this file adds nothing and changes nothing. Editing a row in the
-- Dashboard is safe — flipping `is_active` off, renaming a source, or changing
-- `parser_strategy` will NOT be reverted by running this again.
--
-- To add your own source, append a row here rather than inserting ad hoc, so
-- the seeded set stays reproducible.

insert into public.sources (name, listing_url, parser_strategy, is_active)
values
  ('BBC News',     'https://www.bbc.com/news',       'bbc',      true),
  ('Reuters',      'https://www.reuters.com',        'reuters',  true),
  ('NPR',          'https://www.npr.org',            'npr',      true),
  ('Fox News',     'https://www.foxnews.com',        'fox',      true),
  ('The Guardian', 'https://www.theguardian.com/us', 'guardian', true)
on conflict (listing_url) do nothing;

-- Verify:
--   select name, listing_url, parser_strategy, is_active
--   from public.sources order by name;
