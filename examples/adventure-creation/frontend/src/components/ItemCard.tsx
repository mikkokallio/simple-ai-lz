import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ItemCardProps {
  children: ReactNode
  onClick?: () => void
  className?: string
  hoverable?: boolean
}

export function ItemCard({ children, onClick, className, hoverable = true }: ItemCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg border-2 border-border bg-secondary/50 relative group",
        hoverable && "transition-all hover:border-accent/50",
        onClick && "cursor-pointer hover:scale-105",
        className
      )}
    >
      {children}
    </div>
  )
}
