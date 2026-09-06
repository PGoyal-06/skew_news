/** Full-width subscribe strip above the footer. Presentational only. */
export function NewsletterBand() {
  return (
    <section className="mt-10 rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-body-lg font-semibold text-text-primary">
            Stay Informed. Stay Balanced.
          </h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Get the top stories and bias analysis delivered to your inbox.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            placeholder="Enter your email"
            className="w-full rounded-md border border-border bg-bg-primary px-4 py-2.5 text-body-sm text-text-primary placeholder:text-text-secondary md:w-64"
          />
          <button
            type="button"
            className="rounded-md bg-text-primary px-5 py-2.5 text-body-md font-medium text-white transition-opacity hover:opacity-90"
          >
            Subscribe
          </button>
        </div>
      </div>
    </section>
  );
}
