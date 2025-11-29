import { Adventure, Encounter, NPC, Creature } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Sword, X, User, Sparkle, Warning, DiceSix } from '@phosphor-icons/react'
import { useState } from 'react'
import { FancyCard } from '@/components/FancyCard'
import EmptyState from '@/components/EmptyState'
import CreatureCard from '@/components/CreatureCard'
import MonsterSelector from '@/components/MonsterSelector'
import NPCSelector from '@/components/NPCSelector'
import { MonsterMetadata } from '@/lib/monsterParser'
import { calculateEncounterStats } from '@/lib/encounterCalculator'
import { getEncounterTemplate } from '@/lib/encounter-templates'
import { cn } from '@/lib/utils'

interface EncountersStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

type CreatureReference = {
  id: string
  name: string
  creature: Creature
}

const ABILITY_SKILLS: Record<string, string[]> = {
  Strength: ['Athletics', '(Save)'],
  Dexterity: ['Acrobatics', 'Sleight of Hand', 'Stealth', '(Save)'],
  Constitution: ['(Save)'],
  Intelligence: ['Arcana', 'History', 'Investigation', 'Nature', 'Religion', '(Save)'],
  Wisdom: ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival', '(Save)'],
  Charisma: ['Deception', 'Intimidation', 'Performance', 'Persuasion', '(Save)'],
}

export default function EncountersStage({ adventure, updateAdventure }: EncountersStageProps) {
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(
    adventure.selectedEncounterId || (adventure.structure.encounters.length > 0 ? adventure.structure.encounters[0].id : null)
  )

  const handleSelectEncounter = (encounterId: string) => {
    setSelectedEncounterId(encounterId)
    updateAdventure({ selectedEncounterId: encounterId })
  }
  const [viewingCreatureId, setViewingCreatureId] = useState<string | null>(null)
  const [showMonsterSelector, setShowMonsterSelector] = useState(false)
  const [addingCreatureType, setAddingCreatureType] = useState<'creature' | 'npc' | null>(null)
  const [showNPCSelector, setShowNPCSelector] = useState(false)
  
  const [newCheckAbility, setNewCheckAbility] = useState('Strength')
  const [newCheckSkill, setNewCheckSkill] = useState('none')
  const [newCheckDC, setNewCheckDC] = useState('15')
  const [newCheckDesc, setNewCheckDesc] = useState('')

  const selectedEncounter = adventure.structure.encounters.find(e => e.id === selectedEncounterId)

  const updateEncounter = (id: string, updates: Partial<Encounter>) => {
    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: adventure.structure.encounters.map((enc) => (enc.id === id ? { ...enc, ...updates } : enc)),
      }
    })
  }

  const handleMonsterSelectAsCreature = (creature: Creature, name: string, metadata: MonsterMetadata) => {
    if (!selectedEncounterId) return

    const creatureRef: CreatureReference = {
      id: crypto.randomUUID(),
      name,
      creature
    }

    const encounter = adventure.structure.encounters.find(e => e.id === selectedEncounterId)
    if (encounter) {
      updateEncounter(selectedEncounterId, {
        creatures: [...(encounter.creatures || []), creatureRef.id]
      })
      
      ;(window as any).creatureReferences = (window as any).creatureReferences || []
      ;(window as any).creatureReferences.push(creatureRef)
    }

    setShowMonsterSelector(false)
    setAddingCreatureType(null)
  }

  const handleAddNPCToEncounter = (npcId: string) => {
    if (!selectedEncounterId) return

    const encounter = adventure.structure.encounters.find(e => e.id === selectedEncounterId)
    if (encounter && !(encounter.npcs || []).includes(npcId)) {
      updateEncounter(selectedEncounterId, {
        npcs: [...(encounter.npcs || []), npcId]
      })
    }
    setShowNPCSelector(false)
  }

  const removeCreatureFromEncounter = (encounterId: string, creatureId: string) => {
    const encounter = adventure.structure.encounters.find(e => e.id === selectedEncounterId)
    if (encounter && selectedEncounterId) {
      updateEncounter(selectedEncounterId, {
        creatures: (encounter.creatures || []).filter(c => c !== creatureId)
      })
    }
  }

  const removeNPCFromEncounter = (encounterId: string, npcId: string) => {
    const encounter = adventure.structure.encounters.find(e => e.id === encounterId)
    if (encounter) {
      updateEncounter(encounterId, {
        npcs: (encounter.npcs || []).filter(n => n !== npcId)
      })
    }
  }

  const getEncounterConnections = (encounterId: string) => {
    const connectionsFrom = adventure.structure.connections.filter(c => c.from === encounterId)
    const connectionsTo = adventure.structure.connections.filter(c => c.to === encounterId)
    return { connectionsFrom, connectionsTo }
  }

  const viewingCreature = viewingCreatureId
    ? adventure.npcs.find((npc) => npc.id === viewingCreatureId) ||
      (() => {
        const creatures = (window as any).creatureReferences || []
        return creatures.find((c: CreatureReference) => c.id === viewingCreatureId)
      })()
    : null

  const availableNPCs = adventure.npcs.filter(npc => 
    !selectedEncounter?.npcs?.includes(npc.id)
  )

  const isEmpty = adventure.structure.encounters.length === 0

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-2">Encounters</h2>
          <p className="text-muted-foreground">Design balanced challenges</p>
        </div>

        <EmptyState
          icon={Sword}
          title="Create Encounters in Structure"
          description="Encounters are created and organized on the Structure page. Once you add encounters there, you can return here to add creatures, NPCs, and detailed information."
          action={
            <Button 
              onClick={() => updateAdventure({ stage: 'structure' })}
              variant="default"
              className="gap-2"
            >
              Go to Structure
            </Button>
          }
          animated
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h2 className="mb-2">Encounters</h2>
        <p className="text-muted-foreground">Design balanced challenges and add creatures</p>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="w-64 flex-shrink-0 border-2 overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Encounters</CardTitle>
            <CardDescription className="text-xs">
              Select to edit details
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 px-4">
            {adventure.structure.encounters.map((encounter) => {
              const template = getEncounterTemplate(encounter.type)
              const Icon = template.icon
              
              const encounterXP = (() => {
                if (encounter.type === 'combat') {
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
                    typeof encounter.difficulty === 'string' ? encounter.difficulty : 'moderate',
                    allCRs
                  )
                  return stats.spent
                } else {
                  return encounter.storyXP ?? 0
                }
              })()
              
              return (
                <div
                  key={encounter.id}
                  onClick={() => handleSelectEncounter(encounter.id)}
                  className={cn(
                    'p-3 rounded-lg border-2 cursor-pointer transition-all hover:scale-105',
                    template.bgColor,
                    selectedEncounterId === encounter.id && 'shadow-[0_0_16px_oklch(0.35_0.08_300_/_0.4)]'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <Icon className={cn('w-4 h-4 flex-shrink-0', template.color)} weight="duotone" />
                      <span className="text-xs font-bold uppercase tracking-wide line-clamp-2">
                        {encounter.title}
                      </span>
                    </div>
                  </div>
                  
                  {encounter.description && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1 mb-2">
                      {encounter.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="purple" className="text-[10px] px-2 py-0.5 uppercase tracking-wider">
                      {encounter.durationMinutes || 30}<span className="lowercase">m</span>
                    </Badge>
                    <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                      {encounterXP} XP
                    </Badge>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {selectedEncounter && (
          <Card className="flex-1 border-2 overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>{selectedEncounter.title}</CardTitle>
              <CardDescription>
                Encounter type: {selectedEncounter.type}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="encounter-title">Title</Label>
                  <Input
                    id="encounter-title"
                    value={selectedEncounter.title}
                    onChange={(e) => updateEncounter(selectedEncounter.id, { title: e.target.value })}
                    className="bg-secondary/50 border-border"
                  />
                </div>

                <div>
                  <Label htmlFor="encounter-description">Description</Label>
                  <Textarea
                    id="encounter-description"
                    value={selectedEncounter.description}
                    onChange={(e) => updateEncounter(selectedEncounter.id, { description: e.target.value })}
                    placeholder="Describe what happens in this encounter..."
                    rows={3}
                    className="bg-secondary/50 border-border"
                  />
                </div>

                <div>
                  <Label htmlFor="encounter-location">Location</Label>
                  <Input
                    id="encounter-location"
                    value={selectedEncounter.location || ''}
                    onChange={(e) => updateEncounter(selectedEncounter.id, { location: e.target.value || undefined })}
                    placeholder="Enter location name..."
                    className="bg-secondary/50 border-border"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="encounter-type">Type</Label>
                    <Select
                      value={selectedEncounter.type}
                      onValueChange={(value: Encounter['type']) =>
                        updateEncounter(selectedEncounter.id, { type: value })
                      }
                    >
                      <SelectTrigger className="bg-secondary/50 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="combat">Combat</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                        <SelectItem value="puzzle">Puzzle</SelectItem>
                        <SelectItem value="hazard">Hazard</SelectItem>
                        <SelectItem value="chase">Chase</SelectItem>
                        <SelectItem value="investigation">Investigation</SelectItem>
                        <SelectItem value="survival">Survival</SelectItem>
                        <SelectItem value="skill-challenge">Skill Challenge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="encounter-duration">Duration</Label>
                    <Select
                      value={String(selectedEncounter.durationMinutes || 30)}
                      onValueChange={(value) =>
                        updateEncounter(selectedEncounter.id, { durationMinutes: parseInt(value) })
                      }
                    >
                      <SelectTrigger className="bg-secondary/50 border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedEncounter.type === 'combat' && (
                  <div>
                    <Label htmlFor="encounter-difficulty">Difficulty</Label>
                    <Select
                      value={typeof selectedEncounter.difficulty === 'string' ? selectedEncounter.difficulty : 'moderate'}
                      onValueChange={(value: 'low' | 'moderate' | 'high') =>
                        updateEncounter(selectedEncounter.id, { difficulty: value as any })
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
                )}

                {selectedEncounter.type !== 'combat' && (
                  <div>
                    <Label htmlFor="encounter-story-xp">Story XP</Label>
                    <Input
                      id="encounter-story-xp"
                      type="number"
                      min="0"
                      step="1"
                      value={selectedEncounter.storyXP ?? 0}
                      onChange={(e) =>
                        updateEncounter(selectedEncounter.id, { storyXP: e.target.value ? parseInt(e.target.value) : 0 })
                      }
                      placeholder="Enter XP value..."
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                )}
              </div>

              {(selectedEncounter.type === 'combat' || selectedEncounter.type === 'chase') && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Participants</Label>
                      <span className="text-xs text-muted-foreground">NPCs and Creatures</span>
                    </div>
                    <div className="grid gap-2 grid-cols-1 md:grid-cols-2 mb-3">
                      {(selectedEncounter.npcs || []).map((npcId) => {
                        const npc = adventure.npcs.find((n) => n.id === npcId)
                        return npc ? (
                          <div
                            key={npcId}
                            className="p-3 rounded-lg border-2 border-border bg-secondary/50 transition-all hover:border-accent/50 relative group"
                          >
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => removeNPCFromEncounter(selectedEncounter.id, npcId)}
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
                      {(selectedEncounter.creatures || []).map((creatureId) => {
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
                              onClick={() => removeCreatureFromEncounter(selectedEncounter.id, creatureId)}
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
                        onClick={() => {
                          setAddingCreatureType('creature')
                          setShowMonsterSelector(true)
                        }}
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
                  
                  {selectedEncounter.type === 'combat' && typeof selectedEncounter.difficulty === 'string' && (
                    <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                      <div className="text-sm font-semibold mb-3">Encounter Budget (D&D 2024)</div>
                      {(() => {
                        const allCRs: string[] = []
                        ;(selectedEncounter.npcs || []).forEach((npcId) => {
                          const npc = adventure.npcs.find((n) => n.id === npcId)
                          if (npc?.creature?.cr) allCRs.push(String(npc.creature.cr))
                        })
                        ;(selectedEncounter.creatures || []).forEach((creatureId) => {
                          const creatures = (window as any).creatureReferences || []
                          const creatureRef = creatures.find((c: CreatureReference) => c.id === creatureId)
                          if (creatureRef?.creature?.cr) {
                            console.log(`Found creature ${creatureRef.name} with CR ${creatureRef.creature.cr}`)
                            allCRs.push(String(creatureRef.creature.cr))
                          }
                        })
                        
                        console.log(`Budget calc - All CRs: ${allCRs.join(', ')}`)
                        console.log(`Budget calc - Party level: ${adventure.overview.partyLevelAverage}, Size: ${adventure.overview.playerCount}, Difficulty: ${selectedEncounter.difficulty}`)
                        
                        const stats = calculateEncounterStats(
                          adventure.overview.partyLevelAverage,
                          adventure.overview.playerCount,
                          selectedEncounter.difficulty,
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
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Rewards</Label>
                    <span className="text-xs text-muted-foreground">Treasure and items</span>
                  </div>
                  <div className="space-y-2 mb-3">
                    {(selectedEncounter.rewardIds || []).map((rewardId) => {
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
                              updateEncounter(selectedEncounter.id, {
                                rewardIds: (selectedEncounter.rewardIds || []).filter(id => id !== rewardId)
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
                        if (rewardId !== 'placeholder' && !selectedEncounter.rewardIds?.includes(rewardId)) {
                          updateEncounter(selectedEncounter.id, {
                            rewardIds: [...(selectedEncounter.rewardIds || []), rewardId]
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
                          .filter(r => !selectedEncounter.rewardIds?.includes(r.id))
                          .map((reward) => (
                            <SelectItem key={reward.id} value={reward.id}>
                              {reward.name} ({reward.rarity})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {selectedEncounter.type !== 'combat' && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Important Checks</Label>
                      <span className="text-xs text-muted-foreground">Key ability checks</span>
                    </div>
                    <div className="grid gap-2 grid-cols-1 md:grid-cols-2 mb-3">
                      {(selectedEncounter.importantChecks || []).map((check, index) => (
                        <div
                          key={check.id}
                          className="p-3 rounded-lg border-2 border-border bg-secondary/50 transition-all hover:border-accent/50 relative group"
                        >
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              updateEncounter(selectedEncounter.id, {
                                importantChecks: (selectedEncounter.importantChecks || []).filter(c => c.id !== check.id)
                              })
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                          <div className="flex items-start gap-3 mb-2">
                            <div className="w-12 h-12 rounded-md bg-card/50 border border-border flex items-center justify-center flex-shrink-0">
                              <span className="text-lg font-bold text-foreground">
                                {check.dc}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xs font-bold uppercase tracking-wide line-clamp-2 mb-1">{check.description}</h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="purple" className="text-[10px] px-2 py-0.5 uppercase">
                              {check.type}
                            </Badge>
                            {check.skill && (
                              <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                                {check.skill}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="default"
                          className="gap-2"
                          onClick={() => {
                            setNewCheckAbility('Strength')
                            setNewCheckSkill('none')
                            setNewCheckDC('15')
                            setNewCheckDesc('')
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          Add Ability Check
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border max-w-md">
                        <DialogHeader>
                          <DialogTitle className="text-center">Add Ability Check</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Ability</Label>
                              <Select value={newCheckAbility} onValueChange={(val) => {
                                setNewCheckAbility(val)
                                setNewCheckSkill('none')
                              }}>
                                <SelectTrigger className="bg-secondary/50 border-border">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Strength">Strength</SelectItem>
                                  <SelectItem value="Dexterity">Dexterity</SelectItem>
                                  <SelectItem value="Constitution">Constitution</SelectItem>
                                  <SelectItem value="Intelligence">Intelligence</SelectItem>
                                  <SelectItem value="Wisdom">Wisdom</SelectItem>
                                  <SelectItem value="Charisma">Charisma</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Skill</Label>
                              <Select value={newCheckSkill || 'none'} onValueChange={(val) => setNewCheckSkill(val === 'none' ? '' : val)}>
                                <SelectTrigger className="bg-secondary/50 border-border">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None (Ability Check)</SelectItem>
                                  {ABILITY_SKILLS[newCheckAbility].map((skill) => (
                                    <SelectItem key={skill} value={skill}>
                                      {skill}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <Label>DC</Label>
                            <Input
                              type="number"
                              min="5"
                              max="30"
                              value={newCheckDC}
                              onChange={(e) => setNewCheckDC(e.target.value)}
                              className="bg-secondary/50 border-border"
                            />
                          </div>
                          <div>
                            <Label>Description</Label>
                            <Textarea
                              value={newCheckDesc}
                              onChange={(e) => setNewCheckDesc(e.target.value)}
                              placeholder="Why might this check be needed?"
                              rows={3}
                              className="bg-secondary/50 border-border"
                            />
                          </div>
                          <Button
                            onClick={() => {
                              const newCheck = {
                                id: crypto.randomUUID(),
                                ability: newCheckAbility,
                                skill: newCheckSkill && newCheckSkill !== 'none' ? newCheckSkill : undefined,
                                dc: parseInt(newCheckDC),
                                description: newCheckDesc
                              }
                              updateEncounter(selectedEncounter.id, {
                                importantChecks: [...(selectedEncounter.importantChecks || []), newCheck]
                              })
                              setNewCheckAbility('Strength')
                              setNewCheckSkill('none')
                              setNewCheckDC('15')
                              setNewCheckDesc('')
                            }}
                            disabled={!newCheckDesc.trim()}
                            variant="default"
                            className="gap-2 w-full"
                          >
                            <Plus /> Add Check
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              )}

              <div>
                <Label className="mb-2 block">Connections</Label>
                {(() => {
                  const { connectionsFrom, connectionsTo } = getEncounterConnections(selectedEncounter.id)
                  if (connectionsFrom.length === 0 && connectionsTo.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground p-3 rounded-lg bg-secondary/50 border border-border">
                        No connections. Add connections on the Structure page.
                      </div>
                    )
                  }
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                        <div className="text-xs font-medium text-muted-foreground mb-2">Preceding Encounters:</div>
                        {connectionsTo.length > 0 ? (
                          connectionsTo.map((conn) => {
                            const fromEnc = adventure.structure.encounters.find(e => e.id === conn.from)
                            return fromEnc ? (
                              <div key={conn.from} className="text-sm mb-1">
                                • {fromEnc.title}
                              </div>
                            ) : null
                          })
                        ) : (
                          <div className="text-xs text-muted-foreground">None</div>
                        )}
                      </div>
                      <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                        <div className="text-xs font-medium text-muted-foreground mb-2">Following Encounters:</div>
                        {connectionsFrom.length > 0 ? (
                          connectionsFrom.map((conn) => {
                            const toEnc = adventure.structure.encounters.find(e => e.id === conn.to)
                            return toEnc ? (
                              <div key={conn.to} className="text-sm mb-1">
                                • {toEnc.title}
                              </div>
                            ) : null
                          })
                        ) : (
                          <div className="text-xs text-muted-foreground">None</div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!viewingCreatureId} onOpenChange={(open) => !open && setViewingCreatureId(null)}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewingCreature && viewingCreature.creature && (
            <>
              <DialogHeader>
                <DialogTitle className="text-center">{viewingCreature.name}</DialogTitle>
              </DialogHeader>
              <CreatureCard creature={viewingCreature.creature} name={viewingCreature.name} />
            </>
          )}
        </DialogContent>
      </Dialog>

      <MonsterSelector
        open={showMonsterSelector}
        onOpenChange={setShowMonsterSelector}
        onSelect={handleMonsterSelectAsCreature}
      />

      <NPCSelector
        open={showNPCSelector}
        onOpenChange={setShowNPCSelector}
        npcs={adventure.npcs}
        selectedNPCIds={selectedEncounter?.npcs || []}
        onSelect={handleAddNPCToEncounter}
        title="Add NPC to Encounter"
        description="Select an NPC to add to this encounter"
      />
    </div>
  )
}
