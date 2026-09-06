/**
 * Site chrome: the header's category rail, primary nav, and date line.
 *
 * Not article data — these are presentational constants that moved out of the
 * deleted `lib/mock/*` modules when the pages were wired to Supabase.
 */

export const CATEGORIES: string[] = [
  "Top News",
  "World Cup",
  "IPL",
  "Social Media",
  "Business & Markets",
  "Health & Medicine",
  "Soccer",
  "Artificial Intelligence",
  "Arsenal FC",
  "Extreme Weather and Disasters",
  "Space Exploration",
];

export type NavLink = { label: string; href: string; hasUpdate?: boolean };

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "For You", href: "/for-you", hasUpdate: true },
  { label: "Local", href: "/local" },
  { label: "Blindspot", href: "/blindspot" },
];

/** Today's date, e.g. "Monday, June 1, 2026". */
export function todayLabel(now: Date = new Date()): string {
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
