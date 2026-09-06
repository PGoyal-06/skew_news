import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "cheerio";
import { articleUrl, publicUrl } from "../lib/parsing/urls";
import { extractCandidates } from "../lib/parsing/homepage";
import { parseArticle } from "../lib/parsing/article";
import {
  runScrape,
  scrapeInput,
  InvalidSourceSelection,
} from "../lib/pipeline/scrape";
import { isAdminRequest } from "../lib/security/admin";
import { POST } from "../app/api/scrape/route";
import { GET as logsGET } from "../app/api/logs/route";
import type {
  SourceRow,
  ArticleRow,
  ArticleInsert,
} from "../lib/supabase/types";

const title =
  "Residents seek safer roads after council approves new transport project";
const paragraphs = [
  "Residents have asked the council to explain how its new transport project will make roads safer for people walking to schools and local shops.",
  "The council said the transport project would add crossings near the school and reduce traffic speeds through the neighborhood during the next year.",
  "Local officials plan to publish the final road designs after a consultation where residents can submit comments about the proposed improvements.",
];
const examples = [
  {
    strategy: "bbc",
    host: "www.bbc.com",
    path: "/news/articles/c1234567890o",
    body: 'data-component="text-block"',
    card: 'data-testid="card"',
    reject: "/sport/articles/c1234567890o",
  },
  {
    strategy: "reuters",
    host: "www.reuters.com",
    path: "/world/residents-seek-safer-roads-after-vote-2026-09-05/",
    body: 'data-testid="paragraph"',
    card: 'data-testid="MediaStoryCard"',
    reject: "/world/africa",
  },
  {
    strategy: "npr",
    host: "www.npr.org",
    path: "/2026/09/05/nx-s1-1234567/residents-seek-safer-roads",
    body: 'id="storytext"',
    card: 'class="story-wrap"',
    reject: "/sections/politics",
  },
  {
    strategy: "fox",
    host: "www.foxnews.com",
    path: "/us/residents-seek-safer-roads-after-council-vote",
    body: 'class="article-body"',
    card: "",
    reject: "/shows/the-five",
  },
  {
    strategy: "guardian",
    host: "www.theguardian.com",
    path: "/world/2026/sep/05/residents-seek-safer-roads",
    body: 'class="article-body-commercial-selector"',
    card: "",
    reject: "/thefilter-us",
  },
];
function source(index = 0): SourceRow {
  const item = examples[index];
  return {
    id: "97905799-252e-4de3-a178-158991b4884a",
    name: item.strategy,
    listing_url: `https://${item.host}/`,
    parser_strategy: item.strategy,
    logo_url: null,
    is_active: true,
    created_at: "",
    updated_at: "",
  };
}
function fixture(
  index = 0,
  body = paragraphs.map((p) => `<p>${p}</p>`).join(""),
) {
  const item = examples[index];
  return `<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="https://images.example.com/road.jpg"><meta property="article:published_time" content="2026-09-01T12:00:00Z"></head><body><article><h1>${title}</h1><div ${item.body}>${body}<aside>RELATED HEADLINES</aside><p class="newsletter">Subscribe to the newsletter and get updates from this newspaper in your inbox every single day.</p><script>window.bad()</script></div></article></body></html>`;
}
function homepage(index = 0, paths = [examples[index].path]) {
  return `<html><main>${paths.map((path) => `<article ${examples[index].card}><h3 class="title"><a href="${path}">${title}</a></h3></article>`).join("")}</main></html>`;
}
for (const [index, example] of examples.entries()) {
  test(`${example.strategy}: story card, URL filtering and clean body`, () => {
    const target = source(index);
    assert.ok(articleUrl(example.path, target));
    assert.equal(articleUrl(example.reject, target), null);
    const candidates = extractCandidates(
      homepage(index) +
        `<nav>${homepage(index)}</nav><div hidden>${homepage(index)}</div>`,
      target,
    );
    assert.equal(candidates.candidates.length, 1);
    const parsed = parseArticle(
      fixture(index),
      target,
      `https://${example.host}${example.path}`,
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.article.raw_text, paragraphs.join("\n\n"));
      assert.equal(parsed.article.analyzed_at, null);
    }
  });
}
test("unsafe destinations, uncertain URLs and non-article paths are rejected", () => {
  for (const url of [
    "http://127.0.0.1/x",
    "http://[::1]/x",
    "http://localhost/x",
    "https://user:pass@www.bbc.com/news/articles/c1234567890o",
    "javascript:alert(1)",
  ])
    assert.equal(publicUrl(url), null);
  for (const url of [
    "https://www.bbc.com.evil.example/news/articles/c1234567890o",
    "/news/live/c1234567890o",
    "/news",
    "/news/topics/c1234567890o",
  ])
    assert.equal(articleUrl(url, source()), null);
  assert.equal(
    articleUrl(
      examples[0].path + "?utm_source=test&keep=yes#section",
      source(),
    ),
    `https://www.bbc.com${examples[0].path}?keep=yes`,
  );
});
test("missing metadata, listing canonical and teaser body never pass", () => {
  const url = `https://${examples[0].host}${examples[0].path}`;
  for (const html of [
    fixture().replace(/<meta property="og:image"[^>]+>/, ""),
    fixture().replace(/<meta property="article:published_time"[^>]+>/, ""),
    fixture().replace("</head>", '<link rel="canonical" href="/news"></head>'),
    fixture(0, "<p>Too short.</p>"),
  ])
    assert.equal(parseArticle(html, source(), url).ok, false);
});
test("one long paragraph and article JSON-LD graph have valid fallbacks", () => {
  const long = paragraphs.join(" ").repeat(3);
  const url = `https://${examples[0].host}${examples[0].path}`;
  const parsed = parseArticle(fixture(0, `<p>${long}</p>`), source(), url);
  assert.ok(parsed.ok);
  if (parsed.ok) assert.match(parsed.article.raw_text, /\n\n/);
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "NewsArticle", headline: title, image: { url: "https://images.example.com/news.jpg" }, datePublished: "2026-09-01", articleBody: long }] })}</script></head><body></body></html>`;
  assert.ok(parseArticle(html, source(), url).ok);
});
test("headline link collections do not count as body paragraphs", () => {
  const body = paragraphs
    .map((p) => `<p><a href="/unrelated">${p}</a></p>`)
    .join("");
  assert.equal(
    parseArticle(
      fixture(0, body),
      source(),
      `https://${examples[0].host}${examples[0].path}`,
    ).ok,
    false,
  );
});
test("request schema validates limits, IDs and unknown fields", () => {
  assert.equal(scrapeInput.parse({}).articlesPerSource, 5);
  for (const input of [
    { sourceIds: [] },
    { sourceIds: ["no"] },
    { articlesPerSource: 0 },
    { articlesPerSource: 1.5 },
    { articlesPerSource: 21 },
    { url: "https://example.com" },
  ])
    assert.equal(scrapeInput.safeParse(input).success, false);
});
test("admin check fails closed and API rejects invalid requests before work", async () => {
  const previous = process.env.BIASLY_ADMIN_SECRET;
  try {
    delete process.env.BIASLY_ADMIN_SECRET;
    assert.equal(isAdminRequest(new Request("http://localhost")), false);
    process.env.BIASLY_ADMIN_SECRET = "unit-test-secret";
    for (const headers of [
      new Headers(),
      new Headers({ "x-biasly-admin-secret": "wrong" }),
    ])
      assert.equal(
        (
          await POST(
            new Request("http://localhost", { method: "POST", headers }),
          )
        ).status,
        401,
      );
    const headers = { "x-biasly-admin-secret": "unit-test-secret" };
    assert.equal(
      isAdminRequest(new Request("http://localhost", { headers })),
      true,
    );
    assert.equal(
      (
        await POST(
          new Request("http://localhost", {
            method: "POST",
            headers,
            body: '{"articlesPerSource":0}',
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await POST(
          new Request("http://localhost", {
            method: "POST",
            headers,
            body: "{",
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (await logsGET(new Request("http://localhost?limit=101", { headers })))
        .status,
      400,
    );
  } finally {
    if (previous === undefined) delete process.env.BIASLY_ADMIN_SECRET;
    else process.env.BIASLY_ADMIN_SECRET = previous;
  }
});
const row = (value: ArticleInsert): ArticleRow => ({
  ...value,
  id: "article-id",
  canonical_url: value.canonical_url ?? null,
  scraped_at: value.scraped_at ?? "",
  analyzed_at: null,
  created_at: "",
});
test("pipeline counts duplicates, rejection, failure, insert and stops at valid-insert limit", async () => {
  const paths = [
    "c00000000001",
    "c00000000002",
    "c00000000003",
    "c00000000004",
    "c00000000005",
  ].map((id) => `/news/articles/${id}`);
  let fetched = 0,
    inserts = 0;
  const result = await runScrape(
    { articlesPerSource: 1 },
    {
      sources: async () => [source()],
      log: async () => {},
      existing: async (urls) =>
        new Set(urls.filter((url) => url.endsWith("c00000000001"))),
      fetch: async (_, url) => {
        if (url === source().listing_url)
          return { html: homepage(0, paths), url };
        fetched++;
        if (url.endsWith("c00000000002")) throw new Error("provider failure");
        return {
          html: url.endsWith("c00000000003")
            ? fixture(0, "<p>short</p>")
            : fixture(),
          url,
        };
      },
      insert: async (rows) => {
        inserts++;
        return rows.map(row);
      },
    },
  );
  assert.equal(result.articlesInserted, 1);
  assert.equal(result.articlesFailed, 1);
  assert.equal(result.articlesRejected, 1);
  assert.equal(result.duplicatesSkipped, 1);
  assert.equal(result.detailPagesScraped, 2);
  assert.equal(fetched, 3);
  assert.equal(inserts, 1);
  assert.equal(result.status, "partial");
});
test("canonical duplicate and concurrent conflict are skipped; source failures isolated", async () => {
  const target = source();
  const canonical = `https://${examples[0].host}/news/articles/c00000000009`;
  let calls = 0;
  const result = await runScrape(
    { articlesPerSource: 1 },
    {
      sources: async () => [target, source(1)],
      log: async () => {},
      existing: async (urls) =>
        new Set(urls.filter((url) => url === canonical)),
      fetch: async (s, url) => {
        if (s.parser_strategy === "reuters") throw new Error("failed");
        if (url === target.listing_url)
          return {
            html: homepage(0, [
              examples[0].path,
              "/news/articles/c00000000002",
            ]),
            url,
          };
        calls++;
        return {
          html:
            calls === 1
              ? fixture().replace(
                  "</head>",
                  `<link rel="canonical" href="${canonical}"></head>`,
                )
              : fixture(),
          url,
        };
      },
      insert: async () => [],
    },
  );
  assert.equal(result.duplicatesSkipped, 2);
  assert.equal(result.articlesInserted, 0);
  assert.equal(result.sourcesChecked, 2);
  assert.equal(result.status, "partial");
});
test("inactive selections reject; zero sources and DB failures are explicit", async () => {
  const deps = {
    sources: async () => [],
    log: async () => {},
    existing: async () => new Set<string>(),
    insert: async () => [],
    fetch: async () => ({ html: "", url: "" }),
  };
  assert.equal(
    (await runScrape({ articlesPerSource: 1 }, deps)).status,
    "completed",
  );
  await assert.rejects(
    runScrape({ articlesPerSource: 1, sourceIds: [source().id] }, deps),
    InvalidSourceSelection,
  );
  assert.equal(
    (
      await runScrape(
        { articlesPerSource: 1 },
        {
          ...deps,
          sources: async () => {
            throw new Error("db");
          },
        },
      )
    ).status,
    "failed",
  );
});
test("fixtures use parseable HTML", () =>
  assert.equal(load(fixture())("h1").text(), title));

test("database helpers chunk URL filters and only skip recognized unique conflicts", async () => {
  const { getServiceClient } = await import("../lib/supabase/service");
  const { findExistingUrls, insertArticles } = await import(
    "../lib/supabase/queries/articles"
  );
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unit-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const filters: string[] = [];
  let mode = "read";
  try {
    getServiceClient();
    globalThis.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (mode === "read") {
        filters.push(
          url.searchParams.get("url") ??
            url.searchParams.get("canonical_url") ??
            "",
        );
        return Response.json([
          {
            url: "https://example.com/existing",
            canonical_url: "https://example.com/canonical",
          },
        ]);
      }
      assert.equal(init?.method, "POST");
      if (mode === "conflict")
        return Response.json(
          {
            code: "23505",
            message:
              'duplicate key violates unique constraint "articles_canonical_url_key"',
          },
          { status: 409 },
        );
      return Response.json(
        {
          code: "23505",
          message: 'duplicate key violates unique constraint "articles_pkey"',
        },
        { status: 409 },
      );
    };
    const existing = await findExistingUrls(
      Array.from(
        { length: 31 },
        (_, i) => `https://example.com/${i}?value=%22odd%22`,
      ),
    );
    assert.equal(filters.length, 6);
    assert.ok(filters.every((filter) => filter.split(",").length <= 15));
    assert.ok(existing.has("https://example.com/canonical"));
    const parsed = parseArticle(
      fixture(),
      source(),
      `https://${examples[0].host}${examples[0].path}`,
    );
    assert.ok(parsed.ok);
    if (parsed.ok) {
      mode = "conflict";
      assert.deepEqual(await insertArticles([parsed.article]), []);
      mode = "other";
      await assert.rejects(insertArticles([parsed.article]), /articles_pkey/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("Oxylabs response validation keeps credentials private and rejects unsafe result URLs", async () => {
  const { fetchHtml } = await import("../lib/oxylabs/client");
  const originalFetch = globalThis.fetch;
  const username = process.env.OXY_WSA_USERNAME,
    password = process.env.OXY_WSA_PASSWORD;
  process.env.OXY_WSA_USERNAME = "test-user";
  process.env.OXY_WSA_PASSWORD = "test-password";
  let responseUrl = source().listing_url;
  let status = 200;
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "https://realtime.oxylabs.io/v1/queries");
      assert.equal(init?.redirect, "error");
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.context, [
        { key: "follow_redirects", value: false },
      ]);
      if (status !== 200)
        return new Response("private provider error text", { status });
      return new Response(
        `{"results":[{"job_id":9223372036854775807,"status_code":200,"url":${JSON.stringify(responseUrl)},"content":"<html>content</html>"}]}`,
      );
    };
    assert.equal(
      (await fetchHtml(source(), source().listing_url)).url,
      source().listing_url,
    );
    responseUrl = "http://127.0.0.1/private";
    await assert.rejects(
      fetchHtml(source(), source().listing_url),
      /unsafe_result_url/,
    );
    status = 401;
    await assert.rejects(
      fetchHtml(source(), source().listing_url),
      /oxylabs_http_401/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (username === undefined) delete process.env.OXY_WSA_USERNAME;
    else process.env.OXY_WSA_USERNAME = username;
    if (password === undefined) delete process.env.OXY_WSA_PASSWORD;
    else process.env.OXY_WSA_PASSWORD = password;
  }
});

test("NPR current cards wrap headline inside anchor, excluding section labels", () => {
  const html = `<html><main><article><div class="story-text"><h2 class="slug"><a href="/sections/politics/">Politics</a></h2><a href="${examples[2].path}"><h3 class="title">${title}</h3></a><a href="/series/only-on-npr"><h3 class="title">Only on NPR feature stories</h3></a></div></article></main></html>`;
  const result = extractCandidates(html, source(2));
  assert.deepEqual(result.candidates, [
    `https://${examples[2].host}${examples[2].path}`,
  ]);
  assert.equal(result.found, 2);
  assert.equal(result.rejected, 1);
});

test("Reuters current title links extract main stories without heading tags", () => {
  const html = `<html><main><div data-testid="Title"><a data-testid="TitleLink" href="${examples[1].path}"><span data-testid="TitleHeading">${title}</span></a></div><nav><a data-testid="TitleLink" href="${examples[1].path}"><span data-testid="TitleHeading">${title}</span></a></nav></main></html>`;
  assert.deepEqual(extractCandidates(html, source(1)).candidates, [
    `https://${examples[1].host}${examples[1].path}`,
  ]);
});

test("provider redirect with empty HTML reports target status instead of malformed response", async () => {
  const { fetchHtml } = await import("../lib/oxylabs/client");
  const previousFetch = globalThis.fetch;
  const user = process.env.OXY_WSA_USERNAME,
    password = process.env.OXY_WSA_PASSWORD;
  process.env.OXY_WSA_USERNAME = "test";
  process.env.OXY_WSA_PASSWORD = "test";
  let status = 301;
  try {
    globalThis.fetch = async () =>
      Response.json({
        results: [
          { content: "", status_code: status, url: source(1).listing_url },
        ],
      });
    await assert.rejects(
      fetchHtml(source(1), source(1).listing_url),
      /target_http_301/,
    );
    status = 200;
    await assert.rejects(
      fetchHtml(source(1), source(1).listing_url),
      /empty_provider_content/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (user === undefined) delete process.env.OXY_WSA_USERNAME;
    else process.env.OXY_WSA_USERNAME = user;
    if (password === undefined) delete process.env.OXY_WSA_PASSWORD;
    else process.env.OXY_WSA_PASSWORD = password;
  }
});

test("Reuters numbered div paragraphs preserve article text and inline links", () => {
  const body = paragraphs
    .map(
      (text, index) =>
        `<div data-testid="paragraph-${index}">${index === 0 ? text.replace("Residents", '<a href="/world/">Residents</a>') : text}</div>`,
    )
    .join("");
  const parsed = parseArticle(
    fixture(1, body),
    source(1),
    `https://${examples[1].host}${examples[1].path}`,
  );
  assert.ok(parsed.ok);
  if (parsed.ok) assert.equal(parsed.article.raw_text, paragraphs.join("\n\n"));
});
