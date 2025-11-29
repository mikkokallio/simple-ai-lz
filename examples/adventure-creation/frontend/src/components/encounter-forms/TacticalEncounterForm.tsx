import { Adventure, Encounter, NPC, Creature } from '@/types/adventure'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Sword, X, User, Sparkle } from '@phosphor-icons/react'
import { useState } from 'react'
import CommonEncounterFields from './CommonEncounterFields'
import MonsterSelector from '../MonsterSelector'
import NPCSelector from '../NPCSelector'
import CreatureCard from '../CreatureCard'
import { MonsterMetadata } from '@/lib/monsterParser'
import { calculateEncounterStats } from '@/lib/encounterCalculator'

interface TacticalEncounterFormProps {
  encounter: Encounter
  adventure: Adventure
  onUpdate: (updates: Partial<Encounter>) => void
  onUpdateAdventure: (updates: Partial<Adventure>) => void
}

type CreatureReference = {
  id: string
  name: string
  creature: Creature
}

export default function TacticalEncounterForm({ 
  encounter, 
  adventure, 
  onUpdate,
  onUpdateAdventure 
}: TacticalEncounterFormProps) {
  const [showMonsterSelector, setShowMonsterSelector] = useState(false)
  const [showNPCSelector, setShowNPCSelector] = useState(false)
  const [viewingCreatureId, setViewingCreatureId] = useState<string | null>(null)

  const handleMonsterSelect = (creature: Creature, name: string, metadata: MonsterMetadata) => {
    const creatureRef: CreatureReference = {
      id: crypto.randomUUID(),
      name,
      creature
    }

    onUpdate({
      creatures: [...(encounter.creatures || []), creatureRef.id]
    })
    
    ;(window as any).creatureReferences = (window as any).creatureReferences || []
    ;(window as any).creatureReferences.push(creatureRef)
    
    setShowMonsterSelector(false)
  }

  const handleAddNPC = (npcId: string) => {
    if (!(encounter.npcs || []).includes(npcId)) {
      onUpdate({
        npcs: [...(encounter.npcs || []), npcId]
      })
    }
    setShowNPCSelector(false)
  }

  const removeNPC = (npcId: string) => {
    onUpdate({
      npcs: (encounter.npcs || []).filter(id => id !== npcId)
    })
  }

  const removeCreature = (creatureId: string) => {
    onUpdate({
      creatures: (encounter.creatures || []).filter(id => id !== creatureId)
    })
  }

  const viewingCreature = viewingCreatureId ? (() => {
    const npc = adventure.npcs.find(n => n.id === viewingCreatureId)
    if (npc?.creature) return { name: npc.name, creature: npc.creature }
    
    const creatures = (window as any).creatureReferences || []
    const creatureRef = creatures.find((c: CreatureReference) => c.id === viewingCreatureId)
    if (creatureRef) return { name: creatureRef.name, creature: creatureRef.creature }
    
    return null
  })() : null

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-6">
          <CommonEncounterFields 
            encounter={encounter} 
            onUpdate={onUpdate} 
            showStoryXP={false} 
            defaultDuration={30}
            rightSlot={
              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select
                  value={typeof encounter.difficulty === 'string' ? encounter.difficulty : 'moderate'}
                  onValueChange={(value: 'low' | 'moderate' | 'high') =>
                    onUpdate({ difficulty: value as any })
                  }
                >
                  <SelectTrigger className="bg-secondary/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
          />

          <div>
            <Label htmlFor="stakes">Stakes</Label>
            <Textarea
              id="stakes"
              value={encounter.stakes || ''}
              onChange={(e) => onUpdate({ stakes: e.target.value })}
              placeholder="What's at risk in this encounter?"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="consequences">Consequences</Label>
            <Textarea
              id="consequences"
              value={encounter.consequences || ''}
              onChange={(e) => onUpdate({ consequences: e.target.value })}
              placeholder="What happens if the party fails?"
              rows={2}
            />
          </div>

          {/* Participants Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Participants</Label>
              <span className="text-xs text-muted-foreground">NPCs and Creatures</span>
            </div>
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 mb-3">
              {(encounter.npcs || []).map((npcId) => {
                const npc = adventure.npcs.find((n) => n.id === npcId)
                return npc ? (
                  <div
                    key={npcId}
                    className="p-3 rounded-lg border-2 border-border bg-secondary/50 transition-all hover:border-accent/50 relative group"
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => removeNPC(npcId)}
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
                            <Sword className="w-4 h-4 text-[oklch(0.75_0.12_40)] flex-shrink-0" weight="fill" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {npc.role && (
                        <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                          {npc.role}
                        </Badge>
                      )}
                      {npc.creature && (
                        <Badge variant="purple" className="text-[10px] px-2 py-0.5">
                          CR {npc.creature.cr}
                        </Badge>
                      )}
                      {!npc.creature && (
                        <Badge variant="danger" className="text-[10px] px-2 py-0.5">
                          No Stats
                        </Badge>
                      )}
                      {npc.creature && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setViewingCreatureId(npcId)}
                          className="text-[10px] h-auto p-0 ml-auto"
                        >
                          View Stats →
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null
              })}
              {(encounter.creatures || []).map((creatureId) => {
                const creatures = (window as any).creatureReferences || []
                const creatureRef = creatures.find((c: CreatureReference) => c.id === creatureId)
                return creatureRef ? (
                  <div
                    key={creatureId}
                    className="p-3 rounded-lg border-2 border-border bg-secondary/50 transition-all hover:border-accent/50 relative group"
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => removeCreature(creatureId)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-12 h-12 rounded-md bg-card/50 border border-border flex items-center justify-center flex-shrink-0">
                        <Sword className="w-6 h-6 text-destructive" weight="duotone" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xs font-bold uppercase tracking-wide truncate line-clamp-2">{creatureRef.name}</h3>
                          <Sword className="w-4 h-4 text-destructive flex-shrink-0" weight="fill" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="danger" className="text-[10px] px-2 py-0.5">
                        Creature
                      </Badge>
                      <Badge variant="purple" className="text-[10px] px-2 py-0.5">
                        CR {creatureRef.creature.cr}
                      </Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setViewingCreatureId(creatureId)}
                        className="text-[10px] h-auto p-0 ml-auto"
                      >
                        View Stats →
                      </Button>
                    </div>
                  </div>
                ) : null
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => setShowMonsterSelector(true)}
                variant="default"
                className="gap-2"
              >
                <Sword weight="fill" className="text-[oklch(0.70_0.15_40)]" />
                Add Creature
              </Button>
              <Button
                onClick={() => setShowNPCSelector(true)}
                variant="default"
                className="gap-2"
                disabled={adventure.npcs.length === 0}
              >
                <User weight="fill" className="text-[oklch(0.70_0.15_40)]" />
                Add NPC
              </Button>
            </div>
          </div>

          {/* Encounter Budget */}
          {typeof encounter.difficulty === 'string' && (
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
              <div className="text-sm font-semibold mb-3">Encounter Budget (D&D 2024)</div>
              {(() => {
                const allCRs: string[] = []
                ;(encounter.npcs || []).forEach((npcId) => {
                  const npc = adventure.npcs.find((n) => n.id === npcId)
                  if (npc?.creature?.cr) allCRs.push(String(npc.creature.cr))
                })
                ;(encounter.creatures || []).forEach((creatureId) => {
                  const creatures = (window as any).creatureReferences || []
                  const creatureRef = creatures.find((c: CreatureReference) => c.id === creatureId)
                  if (creatureRef?.creature?.cr) {
                    allCRs.push(String(creatureRef.creature.cr))
                  }
                })
                
                const stats = calculateEncounterStats(
                  adventure.overview.partyLevelAverage,
                  adventure.overview.playerCount,
                  encounter.difficulty,
                  allCRs
                )
                
                const percentColor = stats.percentUsed > 100 ? 'text-destructive' : 
                  stats.percentUsed > 80 ? 'text-yellow-500' : 'text-green-500'
                
                return (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Budget:</span>
                      <span className="font-mono">{stats.budget} XP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Used:</span>
                      <span className="font-mono">{stats.spent} XP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remaining:</span>
                      <span className="font-mono">{stats.remaining} XP</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="text-muted-foreground">Budget Used:</span>
                      <span className={`font-mono font-bold ${percentColor}`}>
                        {Math.round(stats.percentUsed)}%
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Rewards Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Rewards</Label>
              <span className="text-xs text-muted-foreground">Treasure and items</span>
            </div>
            <div className="space-y-2 mb-3">
              {(encounter.rewardIds || []).map((rewardId) => {
                const reward = adventure.rewards.find((r) => r.id === rewardId)
                return reward ? (
                  <div
                    key={rewardId}
                    className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkle className="w-4 h-4 text-yellow-400" weight="fill" />
                      <span className="text-sm font-medium">{reward.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {reward.rarity}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        onUpdate({
                          rewardIds: (encounter.rewardIds || []).filter(id => id !== rewardId)
                        })
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null
              })}
            </div>
            {adventure.rewards.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3 rounded-lg bg-secondary/50 border border-border">
                No rewards available. Create rewards on the Rewards page.
              </div>
            ) : (
              <Select
                value="placeholder"
                onValueChange={(rewardId) => {
                  if (rewardId !== 'placeholder' && !encounter.rewardIds?.includes(rewardId)) {
                    onUpdate({
                      rewardIds: [...(encounter.rewardIds || []), rewardId]
                    })
                  }
                }}
              >
                <SelectTrigger className="bg-secondary/50 border-border">
                  <SelectValue placeholder="Add reward..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Select a reward...</SelectItem>
                  {adventure.rewards
                    .filter(r => !encounter.rewardIds?.includes(r.id))
                    .map((reward) => (
                      <SelectItem key={reward.id} value={reward.id}>
                        {reward.name} ({reward.rarity})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <MonsterSelector
        open={showMonsterSelector}
        onOpenChange={setShowMonsterSelector}
        onSelect={handleMonsterSelect}
      />

      <NPCSelector
        open={showNPCSelector}
        onOpenChange={setShowNPCSelector}
        npcs={adventure.npcs}
        onSelect={handleAddNPC}
      />

      {viewingCreature && (
        <CreatureCard
          name={viewingCreature.name}
          creature={viewingCreature.creature}
          onClose={() => setViewingCreatureId(null)}
        />
      )}
    </>
  )
}
