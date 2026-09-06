import { cn } from "@/lib/utils";

type BiasMeterProps = {
  /** AI-estimated percentages (0–100). Rendered proportional to their sum. */
  left: number;
  center: number;
  right: number;
  size?: "sm" | "md";
  /** Render the 0% / 50% / 100% scale beneath the track. */
  showScale?: boolean;
  className?: string;
};

const segments = [
  { key: "left", label: "Left", bar: "bg-bias-left", text: "text-white" },
  {
    key: "center",
    label: "Center",
    bar: "bg-bias-center",
    text: "text-text-primary",
  },
  { key: "right", label: "Right", bar: "bg-bias-right", text: "text-white" },
] as const;

export function BiasMeter({
  left,
  center,
  right,
  size = "md",
  showScale = false,
  className,
}: BiasMeterProps) {
  const values = { left, center, right };
  const total = left + center + right || 1;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={`AI-estimated bias — left ${left}%, center ${center}%, right ${right}%`}
        className={cn(
          "flex w-full overflow-hidden rounded-sm",
          size === "sm" ? "h-5" : "h-7",
        )}
      >
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${(values[seg.key] / total) * 100}%` }}
            className={cn(
              "flex items-center justify-center overflow-hidden px-1 font-medium whitespace-nowrap",
              size === "sm" ? "text-[10px]" : "text-caption",
              seg.bar,
              seg.text,
            )}
          >
            {seg.label} {values[seg.key]}%
          </div>
        ))}
      </div>
      {showScale ? (
        <div className="mt-1.5 flex justify-between text-caption text-text-secondary">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      ) : null}
    </div>
  );
}
