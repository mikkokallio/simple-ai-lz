import { ComponentProps } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none relative overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-[oklch(0.18_0.03_270)] to-[oklch(0.14_0.03_270)] text-foreground border-2 border-[oklch(0.65_0.15_40)] shadow-[0_2px_8px_oklch(0_0_0_/_0.6),inset_0_1px_0_oklch(1_0_0_/_0.1),inset_0_-1px_0_oklch(0_0_0_/_0.2)] hover:border-[oklch(0.70_0.18_40)] hover:shadow-[0_0_32px_oklch(0.65_0.15_40_/_0.8),0_0_16px_oklch(0.65_0.15_40_/_0.6),0_2px_8px_oklch(0_0_0_/_0.6),inset_0_1px_0_oklch(1_0_0_/_0.15)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[oklch(0.65_0.15_40)]/50 before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none",
        destructive:
          "bg-gradient-to-b from-[oklch(0.18_0.03_270)] to-[oklch(0.14_0.03_270)] text-foreground border-2 border-[oklch(0.60_0.25_25)] shadow-[0_2px_8px_oklch(0_0_0_/_0.6),inset_0_1px_0_oklch(1_0_0_/_0.1),inset_0_-1px_0_oklch(0_0_0_/_0.2)] hover:border-[oklch(0.65_0.28_25)] hover:shadow-[0_0_32px_oklch(0.60_0.25_25_/_0.8),0_0_16px_oklch(0.60_0.25_25_/_0.6),0_2px_8px_oklch(0_0_0_/_0.6),inset_0_1px_0_oklch(1_0_0_/_0.15)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[oklch(0.60_0.25_25)]/50 before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none",
        secondary:
          "bg-gradient-to-b from-[oklch(0.18_0.03_270)] to-[oklch(0.14_0.03_270)] text-foreground border-2 border-[oklch(0.35_0.08_300)] shadow-[0_2px_8px_oklch(0_0_0_/_0.6),inset_0_1px_0_oklch(1_0_0_/_0.1),inset_0_-1px_0_oklch(0_0_0_/_0.2)] hover:border-[oklch(0.45_0.10_300)] hover:shadow-[0_0_28px_oklch(0.35_0.08_300_/_0.7),0_0_14px_oklch(0.35_0.08_300_/_0.5),0_2px_8px_oklch(0_0_0_/_0.6),inset_0_1px_0_oklch(1_0_0_/_0.15)] hover:brightness-110 before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none",
      },
      size: {
        default: "h-10 px-6 py-2 has-[>svg]:px-4 rounded-lg",
        sm: "h-9 rounded-lg gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-lg px-8 has-[>svg]:px-6 text-base",
        icon: "size-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
