import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-body-md font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — solid ink fill.
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-bg-secondary disabled:text-text-secondary",
        // Secondary — white surface with a hairline border.
        secondary:
          "bg-bg-primary text-text-primary border-border hover:bg-surface disabled:bg-bg-primary disabled:text-text-secondary disabled:border-border",
        // Outline — transparent until hover.
        outline:
          "border-border bg-transparent text-text-primary hover:border-text-primary hover:bg-surface disabled:text-text-secondary disabled:border-border disabled:hover:bg-transparent",
        // Text — no chrome; turns brand blue on hover.
        text: "bg-transparent text-text-primary hover:text-bias-right disabled:text-text-secondary disabled:hover:text-text-secondary",
        // Destructive — left-bias red, reserved for irreversible actions.
        destructive:
          "bg-bias-left text-white hover:bg-bias-left/90 focus-visible:ring-bias-left/30",
      },
      size: {
        sm: "h-8 px-3 text-body-sm [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
