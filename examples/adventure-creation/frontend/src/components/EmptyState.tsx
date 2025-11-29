import { ReactNode } from 'react'
import { FancyCard } from '@/components/FancyCard'
import { Icon } from '@phosphor-icons/react'

interface EmptyStateProps {
  icon: Icon
  title: string
  description: string
  action?: ReactNode
  animated?: boolean
}

export default function EmptyState({ icon: Icon, title, description, action, animated = false }: EmptyStateProps) {
  return (
    <FancyCard animated={animated} className="p-8 text-center">
      <Icon className="w-16 h-16 text-[oklch(0.70_0.15_40)] mx-auto mb-4 drop-shadow-[0_0_15px_oklch(0.65_0.15_40_/_0.6)]" weight="duotone" />
      <h3 className="text-xl mb-3">{title}</h3>
      <p className="text-muted-foreground mb-6">
        {description}
      </p>
      {action}
    </FancyCard>
  )
}
