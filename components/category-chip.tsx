import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/icon";

type CategoryChipProps = ComponentProps<"button"> & {
  label: string;
  /** Show a trailing "+" (add-to-interests affordance). */
  addable?: boolean;
  selected?: boolean;
};

export function CategoryChip({
  label,
  addable = false,
  selected = false,
  className,
  type = "button",
  ...props
}: CategoryChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-body-sm transition-colors",
        selected
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-primary hover:bg-surface",
        className,
      )}
      {...props}
    >
      {label}
      {addable ? <Icon name="plus" size={14} /> : null}
    </button>
  );
}
