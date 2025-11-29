import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FancyCardProps {
  children: ReactNode
  className?: string
  animated?: boolean
  onClick?: () => void
  hoverable?: boolean
}

export function FancyCard({ 
  children, 
  className, 
  animated = false,
  onClick,
  hoverable = false
}: FancyCardProps) {
  return (
    <div 
      className={cn(
        'fancy-card p-4',
        animated && 'glow-border-animated',
        hoverable && 'transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-accent/20 cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
