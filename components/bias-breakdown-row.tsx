import type { BiasTone } from "@/lib/view/articles";
import { cn } from "@/lib/utils";

type BiasBreakdownRowProps = {
  label: string;
  /** Right-hand figure, e.g. "49%" or "6 (49%)". */
  valueLabel: string;
  /** 0–100; sizes the mini track fill. */
  percent: number;
  tone: BiasTone;
  className?: string;
};

const FILL: Record<BiasTone, string> = {
  left: "bg-bias-left",
  center: "bg-[#9ca3af]",
  right: "bg-bias-right",
};

const VALUE_TEXT: Record<BiasTone, string> = {
  left: "text-bias-left",
  center: "text-text-primary",
  right: "text-bias-right",
};

/** Sidebar row: label · figure · proportional mini track. */
export function BiasBreakdownRow({
  label,
  valueLabel,
  percent,
  tone,
  className,
}: BiasBreakdownRowProps) {
  return (
    <div className={cn("flex items-center gap-3 text-body-sm", className)}>
      <span className="w-14 shrink-0 text-text-primary">{label}</span>
      <span className={cn("w-20 shrink-0", VALUE_TEXT[tone])}>{valueLabel}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bias-center">
        <span
          style={{ width: `${percent}%` }}
          className={cn("block h-full rounded-full", FILL[tone])}
        />
      </span>
    </div>
  );
}
