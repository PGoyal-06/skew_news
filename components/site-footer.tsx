import {
  InstagramIcon,
  LinkedInIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/social-icons";
import { Wordmark } from "@/components/wordmark";

const LINK_COLUMNS = [
  {
    heading: "Company",
    links: ["About", "Careers", "Press", "Contact"],
  },
  {
    heading: "Help",
    links: ["Help Center", "Guides", "Privacy Policy", "Terms of Service"],
  },
] as const;

const SOCIALS = [
  { label: "X", Glyph: XIcon },
  { label: "LinkedIn", Glyph: LinkedInIcon },
  { label: "Instagram", Glyph: InstagramIcon },
  { label: "YouTube", Glyph: YouTubeIcon },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-text-primary text-white">
      <div className="container-page py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark inverted />
            <p className="mt-4 max-w-[220px] text-body-sm text-white/60">
              Balanced news coverage powered by AI.
            </p>
          </div>

          {LINK_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="text-body-sm font-semibold text-white">
                {column.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link}>
                    <span className="text-body-sm text-white/60 transition-colors hover:text-white">
                      {link}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h2 className="text-body-sm font-semibold text-white">Connect</h2>
            <ul className="mt-4 flex items-center gap-4">
              {SOCIALS.map(({ label, Glyph }) => (
                <li key={label}>
                  <span
                    aria-label={label}
                    role="img"
                    className="block text-white/60 transition-colors hover:text-white"
                  >
                    <Glyph />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-[#2a2a2e] pt-6">
          <p className="text-caption text-white/50">
            © 2026 Biasly News. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
