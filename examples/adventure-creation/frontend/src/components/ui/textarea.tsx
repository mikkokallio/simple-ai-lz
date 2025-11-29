import { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border placeholder:text-muted-foreground bg-card/50 backdrop-blur-sm flex field-sizing-content min-h-20 w-full rounded-lg border-2 px-4 py-3 text-base transition-[color,box-shadow,border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "shadow-[inset_0_2px_4px_oklch(0_0_0_/_0.15),inset_0_1px_2px_oklch(0_0_0_/_0.1)]",
        "focus-visible:border-[oklch(0.40_0.08_300)] focus-visible:bg-[oklch(0.19_0.03_270)] focus-visible:shadow-[0_0_12px_oklch(0.35_0.08_300_/_0.4),inset_0_2px_4px_oklch(0_0_0_/_0.15)]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
