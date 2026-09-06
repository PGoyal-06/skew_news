import { cn } from "@/lib/utils";

type WordmarkProps = {
  /** Renders the light-on-dark variant used in the footer. */
  inverted?: boolean;
  className?: string;
};

export function Wordmark({ inverted = false, className }: WordmarkProps) {
  return (
    <span className={cn("shrink-0 leading-none", className)}>
      <span
        className={cn(
          "block text-[26px] font-bold tracking-tight",
          inverted ? "text-white" : "text-text-primary",
        )}
      >
        biasly
      </span>
      <span
        className={cn(
          "block text-caption font-medium",
          inverted ? "text-white/60" : "text-text-secondary",
        )}
      >
        News
      </span>
    </span>
  );
}
