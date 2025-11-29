import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatBadgeProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'accent' | 'muted'
}

export function StatBadge({ children, className, variant = 'default' }: StatBadgeProps) {
  return (
    <div 
      className={cn(
        'stat-badge',
        variant === 'accent' && 'border-accent/50 text-accent',
        variant === 'muted' && 'border-muted-foreground/30 text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  )
}
