import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Next.js 16 renamed Middleware to Proxy. `clerkMiddleware()` only attaches auth
 * state to the request — no auth checks live here.
 *
 * Protected resources guard themselves: `app/news/[slug]/page.tsx` gates the full
 * article analysis, and action routes use the `x-biasly-admin-secret` header.
 * Clerk deprecated `createRouteMatcher` because path matching can diverge from how
 * Next.js actually routes requests. `config.matcher` below is still required.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
