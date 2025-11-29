import { ComponentProps } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg border-2 px-3 py-1 text-xs font-bold uppercase tracking-wider w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-all overflow-hidden shadow-lg",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/30 [a&]:hover:shadow-xl [a&]:hover:shadow-primary/40 [a&]:hover:scale-105",
        secondary:
          "border-transparent bg-gradient-to-br from-secondary to-secondary/80 text-secondary-foreground [a&]:hover:shadow-xl [a&]:hover:scale-105",
        destructive:
          "border-transparent bg-gradient-to-br from-destructive to-destructive/80 text-white shadow-destructive/30 [a&]:hover:shadow-xl [a&]:hover:shadow-destructive/40 [a&]:hover:scale-105 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border-[oklch(0.65_0.15_40)] bg-card/50 backdrop-blur-sm text-foreground [a&]:hover:bg-card [a&]:hover:shadow-[0_0_15px_oklch(0.65_0.15_40_/_0.3)] [a&]:hover:scale-105",
        golden:
          "bg-card/50 border-[oklch(0.65_0.15_40)]/50 text-[oklch(0.75_0.12_40)]",
        purple:
          "bg-card/50 border-[oklch(0.35_0.08_300)]/60 text-muted-foreground",
        danger:
          "bg-destructive/10 border-destructive/30 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
