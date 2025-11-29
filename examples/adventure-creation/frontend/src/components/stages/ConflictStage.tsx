import { Adventure } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'

interface ConflictStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function ConflictStage({ adventure, updateAdventure }: ConflictStageProps) {
  const [villainName, setVillainName] = useState('')

  const createVillain = () => {
    if (!adventure.conflict.villain) {
      updateAdventure({
        conflict: {
          ...adventure.conflict,
          villain: {
            id: crypto.randomUUID(),
            name: villainName || 'Unnamed Villain',
            goal: '',
            methods: '',
            weakness: '',
          },
        },
      })
      setVillainName('')
    }
  }

  const updateVillain = (updates: Partial<typeof adventure.conflict.villain>) => {
    if (adventure.conflict.villain) {
      updateAdventure({
        conflict: {
          ...adventure.conflict,
          villain: { ...adventure.conflict.villain, ...updates },
        },
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Conflict & Factions</h2>
        <p className="text-muted-foreground">Define the central conflict and factions</p>
      </div>

      {!adventure.conflict.villain ? (
        <Card className="parchment-texture border-2">
          <CardHeader>
            <CardTitle>Create Main Villain</CardTitle>
            <CardDescription>Every great adventure needs a compelling antagonist</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="villain-name">Villain Name</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="villain-name"
                  value={villainName}
                  onChange={(e) => setVillainName(e.target.value)}
                  placeholder="Enter villain name..."
                />
                <Button onClick={createVillain} className="gap-2">
                  <Plus /> Create
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="parchment-texture border-2">
          <CardHeader>
            <CardTitle>{adventure.conflict.villain.name}</CardTitle>
            <CardDescription>Main Antagonist</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="villain-goal">Goal</Label>
              <Textarea
                id="villain-goal"
                value={adventure.conflict.villain.goal}
                onChange={(e) => updateVillain({ goal: e.target.value })}
                placeholder="What does the villain want to achieve?"
                rows={3}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="villain-methods">Methods</Label>
              <Textarea
                id="villain-methods"
                value={adventure.conflict.villain.methods}
                onChange={(e) => updateVillain({ methods: e.target.value })}
                placeholder="How will they achieve their goal?"
                rows={3}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="villain-weakness">Weakness</Label>
              <Textarea
                id="villain-weakness"
                value={adventure.conflict.villain.weakness}
                onChange={(e) => updateVillain({ weakness: e.target.value })}
                placeholder="What is their vulnerability?"
                rows={2}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="parchment-texture border-2">
        <CardHeader>
          <CardTitle>Core Conflict</CardTitle>
          <CardDescription>Describe the central tension of your adventure</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={adventure.conflict.conflictDescription}
            onChange={(e) =>
              updateAdventure({
                conflict: { ...adventure.conflict, conflictDescription: e.target.value },
              })
            }
            placeholder="What is the main conflict driving this story?"
            rows={5}
          />
        </CardContent>
      </Card>

      <Card className="parchment-texture border-2">
        <CardHeader>
          <CardTitle>Factions</CardTitle>
          <CardDescription>Coming soon - faction relationship mapping</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Visual faction relationship web will be available here
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
