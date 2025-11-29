import { Adventure } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'

interface RewardsStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function RewardsStage({ adventure, updateAdventure }: RewardsStageProps) {
  const [rewardName, setRewardName] = useState('')

  const addReward = () => {
    if (rewardName.trim()) {
      updateAdventure({
        rewards: [
          ...adventure.rewards,
          {
            id: crypto.randomUUID(),
            name: rewardName.trim(),
            type: 'treasure',
            rarity: 'common',
            description: '',
          },
        ],
      })
      setRewardName('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Rewards & Progression</h2>
        <p className="text-muted-foreground">Design rewards for your players</p>
      </div>

      <Card className="parchment-texture border-2">
        <CardHeader>
          <CardTitle>Add Reward</CardTitle>
          <CardDescription>Create treasure, items, or social rewards</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={rewardName}
              onChange={(e) => setRewardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addReward()}
              placeholder="Reward name..."
            />
            <Button onClick={addReward} variant="default" className="gap-2">
              <Plus /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {adventure.rewards.map((reward) => (
          <Card key={reward.id} className="parchment-texture border-2">
            <CardHeader>
              <CardTitle className="flex items-start justify-between">
                <span>{reward.name}</span>
                <Badge variant="secondary">{reward.rarity}</Badge>
              </CardTitle>
              <CardDescription>{reward.type}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {reward.description || 'No description'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
