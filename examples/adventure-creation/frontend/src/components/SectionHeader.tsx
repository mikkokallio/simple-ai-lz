import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string | ReactNode
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-2", className)}>
      {typeof title === 'string' ? <h4 className="font-medium">{title}</h4> : title}
      {action}
    </div>
  )
}
