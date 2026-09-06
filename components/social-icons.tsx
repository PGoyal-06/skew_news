import type { SVGProps } from "react";

/**
 * Brand marks for the footer. lucide-react v1 dropped brand icons, so these are
 * hand-inlined paths sized to match the 18px lucide glyphs around them.
 */
type BrandIconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...props }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function XIcon(props: BrandIconProps) {
  return (
    <Svg {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </Svg>
  );
}

export function LinkedInIcon(props: BrandIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM2.75 9.5h4.46V21H2.75V9.5Zm7.06 0h4.28v1.57h.06c.6-1.08 2.06-2.22 4.24-2.22 4.53 0 5.37 2.85 5.37 6.55V21h-4.46v-4.71c0-1.12-.02-2.57-1.6-2.57-1.6 0-1.85 1.22-1.85 2.49V21H9.81V9.5Z" />
    </Svg>
  );
}

export function InstagramIcon(props: BrandIconProps) {
  return (
    <Svg {...props} fill="none">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" />
    </Svg>
  );
}

export function YouTubeIcon(props: BrandIconProps) {
  return (
    <Svg {...props}>
      <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.78C18.25 5 12 5 12 5s-6.25 0-7.81.41a2.51 2.51 0 0 0-1.77 1.78A26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.78C5.75 19 12 19 12 19s6.25 0 7.81-.41a2.51 2.51 0 0 0 1.77-1.78A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z" />
    </Svg>
  );
}
