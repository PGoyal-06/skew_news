import type { ComponentProps } from "react";
import {
  BarChart3,
  Bell,
  Bookmark,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Info,
  MapPin,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Tag,
  User,
} from "lucide-react";

/**
 * The design-system icon set — lucide line icons, which already match the
 * sheet's "Line style · 2px stroke · Rounded caps" spec. Consume icons only
 * through this wrapper so size/stroke stay consistent app-wide.
 */
const registry = {
  menu: Menu,
  search: Search,
  bookmark: Bookmark,
  clock: Clock,
  info: Info,
  share: Share2,
  external: ExternalLink,
  calendar: Calendar,
  chart: BarChart3,
  tag: Tag,
  user: User,
  bell: Bell,
  sliders: SlidersHorizontal,
  "check-circle": CheckCircle2,
  more: MoreHorizontal,
  plus: Plus,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  globe: Globe,
  "map-pin": MapPin,
} as const;

export type IconName = keyof typeof registry;

export const ICON_NAMES = Object.keys(registry) as IconName[];

type IconProps = ComponentProps<typeof Menu> & { name: IconName };

export function Icon({ name, size = 20, strokeWidth = 2, ...props }: IconProps) {
  const Glyph = registry[name];
  return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
}
