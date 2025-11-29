import { Adventure } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Sparkle, Plus, X, User } from '@phosphor-icons/react'
import { FancyCard } from '@/components/FancyCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import NPCSelector from '@/components/NPCSelector'
import { useState } from 'react'

interface OverviewStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function OverviewStage({ adventure, updateAdventure }: OverviewStageProps) {
  const [showNPCSelector, setShowNPCSelector] = useState(false)

  const updateOverview = (updates: Partial<typeof adventure.overview>) => {
    updateAdventure({
      overview: { ...adventure.overview, ...updates },
    })
  }

  const updateName = (name: string) => {
    updateAdventure({ name })
  }

  const toggleAntagonist = (npcId: string) => {
    const currentAntagonists = adventure.overview.antagonistIds || []
    const antagonistIds = currentAntagonists.includes(npcId)
      ? currentAntagonists.filter((id) => id !== npcId)
      : [...currentAntagonists, npcId]
    updateOverview({ antagonistIds })
    if (!currentAntagonists.includes(npcId)) {
      setShowNPCSelector(false)
    }
  }

  const removeAntagonist = (npcId: string) => {
    const currentAntagonists = adventure.overview.antagonistIds || []
    updateOverview({ antagonistIds: currentAntagonists.filter((id) => id !== npcId) })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Adventure Overview</h2>
        <p className="text-muted-foreground">Define your adventure's identity, scope, and tone</p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="flex-1 border-2 overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Core Identity</CardTitle>
            <CardDescription className="text-xs">
              What is this adventure about?
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 px-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-3">
              <Label htmlFor="adventure-title">Adventure Title</Label>
              <Input
                id="adventure-title"
                value={adventure.name}
                onChange={(e) => updateName(e.target.value)}
                placeholder="Enter your adventure title..."
                className="mt-2 bg-secondary/50 border-border font-bold text-lg"
              />
            </div>
            <div>
              <Label>Party Level Average</Label>
              <Select
                value={String(adventure.overview.partyLevelAverage)}
                onValueChange={(value) => updateOverview({ partyLevelAverage: parseInt(value) })}
              >
                <SelectTrigger className="mt-2 bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(level => (
                    <SelectItem key={level} value={String(level)}>Level {level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="player-count">Number of Players</Label>
              <Select
                value={String(adventure.overview.playerCount)}
                onValueChange={(value) => updateOverview({ playerCount: parseInt(value) })}
              >
                <SelectTrigger className="mt-2 bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map(count => (
                    <SelectItem key={count} value={String(count)}>{count} Player{count !== 1 ? 's' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="pitch">Adventure Pitch</Label>
            <Textarea
              id="pitch"
              value={adventure.overview.pitch}
              onChange={(e) => updateOverview({ pitch: e.target.value })}
              placeholder="Describe your adventure in a few compelling sentences..."
              rows={4}
              className="mt-2 bg-secondary/50 border-border"
            />
          </div>

          <div>
            <Label htmlFor="core-conflict">Core Conflict</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              What is the central tension or problem driving this adventure?
            </p>
            <Textarea
              id="core-conflict"
              value={adventure.overview.coreConflict || ''}
              onChange={(e) => updateOverview({ coreConflict: e.target.value })}
              placeholder="A powerful necromancer threatens to raise an undead army unless the heroes can stop the ritual..."
              rows={3}
              className="mt-2 bg-secondary/50 border-border"
            />
          </div>

          <div>
            <Label>Main Antagonist(s)</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Select NPCs from your list to serve as antagonists
            </p>
            <div className="space-y-3">
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2  lg:grid-cols-3">
                {(adventure.overview.antagonistIds || []).map((npcId) => {
                  const npc = adventure.npcs.find((n) => n.id === npcId)
                  return npc ? (
                    <div
                      key={npcId}
                      className="p-3 rounded-lg border-2 border-border bg-secondary/50 transition-all hover:border-accent/50 relative group"
                    >
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => removeAntagonist(npcId)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <div className="flex items-start gap-3 mb-2">
                        {npc.portraitUrl ? (
                          <img src={npc.portraitUrl} alt={npc.name} className="w-12 h-12 rounded-md object-cover border border-border flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-card/50 border border-border flex items-center justify-center flex-shrink-0">
                            <User className="w-6 h-6 text-muted-foreground" weight="duotone" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-xs font-bold uppercase tracking-wide truncate line-clamp-2">{npc.name}</h3>
                            {npc.creature && (
                              <Sparkle className="w-4 h-4 text-[oklch(0.75_0.12_40)] flex-shrink-0" weight="fill" />
                            )}
                          </div>
                        </div>
                      </div>
                      {npc.role && (
                        <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                          {npc.role}
                        </Badge>
                      )}
                      {!npc.role && <p className="text-[10px] text-muted-foreground line-clamp-1">No role assigned</p>}
                    </div>
                  ) : null
                })}
              </div>
              <Button
                onClick={() => setShowNPCSelector(true)}
                variant="outline"
                className="w-full gap-2 bg-card border-2 border-[oklch(0.65_0.15_40)]/50 text-[oklch(0.75_0.12_40)] hover:border-[oklch(0.65_0.15_40)]/70 hover:bg-card/80"
                disabled={adventure.npcs.length === 0}
              >
                <User weight="fill" className="text-[oklch(0.70_0.15_40)]" />
                {adventure.npcs.length === 0 ? 'No available NPCs' : 'Add NPC'}
              </Button>
              {(adventure.overview.antagonistIds || []).length > 0 && (
                <div>
                  <Label htmlFor="antagonist-goals" className="mt-3">Antagonist Goals</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    What do the antagonists want to achieve?
                  </p>
                  <Textarea
                    id="antagonist-goals"
                    value={adventure.overview.antagonistGoals || ''}
                    onChange={(e) => updateOverview({ antagonistGoals: e.target.value })}
                    placeholder="Describe the antagonist's goals, motivations, and methods..."
                    rows={3}
                    className="mt-2 bg-secondary/50 border-border"
                  />
                </div>
              )}
            </div>
          </div>

        </div>
          </CardContent>
        </Card>
        </div>


      <NPCSelector
        open={showNPCSelector}
        onOpenChange={setShowNPCSelector}
        npcs={adventure.npcs}
        selectedNPCIds={adventure.overview.antagonistIds || []}
        onSelect={toggleAntagonist}
        multiSelect={true}
        title="Select Antagonist"
        description="Choose NPCs to serve as antagonists in your adventure"
      />
    </div>
  )
}