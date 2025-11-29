import { Adventure, CustomStatBlock, Creature } from '@/types/adventure'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Plus, Sword, Trash, ArrowLeft } from '@phosphor-icons/react'
import { useState } from 'react'
import { FancyCard } from '@/components/FancyCard'
import { toast } from 'sonner'
import CreatureCard from '@/components/CreatureCard'
import MonsterSelector from '@/components/MonsterSelector'
import type { MonsterMetadata } from '@/lib/monsterParser'
import { cn } from '@/lib/utils'

interface StatBuilderStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function StatBuilderStage({ adventure, updateAdventure }: StatBuilderStageProps) {
  const [viewTab, setViewTab] = useState<'list' | 'editor'>('list')
  const [editingStatBlock, setEditingStatBlock] = useState<CustomStatBlock | null>(null)
  const [showMonsterSelector, setShowMonsterSelector] = useState(false)

  const createNewStatBlock = () => {
    const newStatBlock: CustomStatBlock = {
      id: crypto.randomUUID(),
      name: 'New Creature',
      creature: {
        size: 'Medium',
        type: 'humanoid',
        alignment: 'neutral',
        ac: 10,
        hp: '10 (2d8)',
        speed: '30 ft.',
        abilityScores: {
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
        cr: '0',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    updateAdventure({
      customStatBlocks: [...adventure.customStatBlocks, newStatBlock],
    })
    setEditingStatBlock(newStatBlock)
    setViewTab('editor')
    toast.success('Created new stat block')
  }

  const handleMonsterSelect = (creature: Creature, name: string, metadata: MonsterMetadata) => {
    const newStatBlock: CustomStatBlock = {
      id: crypto.randomUUID(),
      name: name,
      creature: creature,
      sourceCreatureName: name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    updateAdventure({
      customStatBlocks: [...adventure.customStatBlocks, newStatBlock],
    })
    setEditingStatBlock(newStatBlock)
    setShowMonsterSelector(false)
    setViewTab('editor')
    toast.success(`Created stat block from ${name}`)
  }

  const updateStatBlock = (id: string, updates: Partial<CustomStatBlock>) => {
    const updatedStatBlocks = adventure.customStatBlocks.map((sb) =>
      sb.id === id ? { ...sb, ...updates, updatedAt: Date.now() } : sb
    )
    updateAdventure({
      customStatBlocks: updatedStatBlocks,
    })
    if (editingStatBlock?.id === id) {
      setEditingStatBlock({ ...editingStatBlock, ...updates, updatedAt: Date.now() })
    }
  }

  const deleteStatBlock = (id: string) => {
    const updatedStatBlocks = adventure.customStatBlocks.filter((sb) => sb.id !== id)
    updateAdventure({
      customStatBlocks: updatedStatBlocks,
    })
    if (editingStatBlock?.id === id) {
      setEditingStatBlock(null)
      setViewTab('list')
    }
    toast.success('Stat block deleted')
  }

  const updateCreature = (updates: Partial<Creature>) => {
    if (!editingStatBlock) return
    
    updateStatBlock(editingStatBlock.id, {
      creature: { ...editingStatBlock.creature, ...updates }
    })
  }

  const editStatBlock = (statBlock: CustomStatBlock) => {
    setEditingStatBlock(statBlock)
    setViewTab('editor')
  }

  const backToList = () => {
    setEditingStatBlock(null)
    setViewTab('list')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Stat Builder</h2>
        <p className="text-muted-foreground">Create and manage custom creature stat blocks</p>
      </div>

      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'list' | 'editor')}>
        <TabsList className="elegant-tabs-list w-full justify-start mb-6">
          <TabsTrigger value="list" className="elegant-tab-trigger">Stat Block Library</TabsTrigger>
          <TabsTrigger value="editor" disabled={!editingStatBlock} className="elegant-tab-trigger">
            {editingStatBlock ? `Editing: ${editingStatBlock.name}` : 'Editor'}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="list" className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={() => setShowMonsterSelector(true)} variant="default" className="gap-2">
              <Sword />
              Start from Existing Creature
            </Button>
            <Button onClick={createNewStatBlock} variant="destructive" className="gap-2">
              <Plus />
              Empty Canvas
            </Button>
          </div>

          {adventure.customStatBlocks.length === 0 ? (
            <FancyCard animated className="p-8 text-center">
              <Sword className="w-16 h-16 text-accent mx-auto mb-4" weight="duotone" />
              <h3 className="text-xl mb-3">No Custom Stat Blocks Yet</h3>
              <p className="text-muted-foreground">
                Create custom creature stat blocks from scratch or start from an existing creature in the library.
              </p>
            </FancyCard>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {adventure.customStatBlocks.map((statBlock) => (
                <FancyCard key={statBlock.id} hoverable onClick={() => editStatBlock(statBlock)} className="cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sword className="w-5 h-5 text-accent" weight="fill" />
                      <h3 className="text-base">{statBlock.name}</h3>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{statBlock.creature.size} {statBlock.creature.type}, CR {statBlock.creature.cr}</p>
                    {statBlock.sourceCreatureName && (
                      <p className="text-xs italic">Based on {statBlock.sourceCreatureName}</p>
                    )}
                  </div>
                </FancyCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="editor" className="space-y-4">
          {editingStatBlock ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Button onClick={backToList} variant="secondary" className="gap-2">
                  <ArrowLeft />
                  Back to Library
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="gap-2">
                      <Trash className="w-4 h-4" />
                      Delete Stat Block
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-center">Delete {editingStatBlock.name}</AlertDialogTitle>
                      <AlertDialogDescription className="text-center">
                        This will permanently delete this stat block. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteStatBlock(editingStatBlock.id)} className={cn(buttonVariants({ variant: "destructive" }))}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <FancyCard className="p-6 space-y-4">
                <div>
                  <Label htmlFor="stat-name">Creature Name</Label>
                  <Input
                    id="stat-name"
                    value={editingStatBlock.name}
                    onChange={(e) => updateStatBlock(editingStatBlock.id, { name: e.target.value })}
                    className="bg-secondary/50 border-border"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="creature-size">Size</Label>
                    <Input
                      id="creature-size"
                      value={editingStatBlock.creature.size}
                      onChange={(e) => updateCreature({ size: e.target.value })}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="creature-type">Type</Label>
                    <Input
                      id="creature-type"
                      value={editingStatBlock.creature.type}
                      onChange={(e) => updateCreature({ type: e.target.value })}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="creature-alignment">Alignment</Label>
                    <Input
                      id="creature-alignment"
                      value={editingStatBlock.creature.alignment}
                      onChange={(e) => updateCreature({ alignment: e.target.value })}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="creature-ac">AC</Label>
                    <Input
                      id="creature-ac"
                      type="number"
                      value={editingStatBlock.creature.ac}
                      onChange={(e) => updateCreature({ ac: parseInt(e.target.value) || 10 })}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="creature-hp">HP</Label>
                    <Input
                      id="creature-hp"
                      value={editingStatBlock.creature.hp}
                      onChange={(e) => updateCreature({ hp: e.target.value })}
                      placeholder="e.g., 65 (10d8 + 20)"
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="creature-speed">Speed</Label>
                    <Input
                      id="creature-speed"
                      value={editingStatBlock.creature.speed}
                      onChange={(e) => updateCreature({ speed: e.target.value })}
                      placeholder="e.g., 30 ft."
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Ability Scores</Label>
                  <div className="grid grid-cols-6 gap-2">
                    {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ability) => (
                      <div key={ability}>
                        <Label htmlFor={`creature-${ability}`} className="text-xs uppercase">
                          {ability}
                        </Label>
                        <Input
                          id={`creature-${ability}`}
                          type="number"
                          value={editingStatBlock.creature.abilityScores[ability]}
                          onChange={(e) => updateCreature({
                            abilityScores: {
                              ...editingStatBlock.creature.abilityScores,
                              [ability]: parseInt(e.target.value) || 10
                            }
                          })}
                          className="bg-secondary/50 border-border"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="creature-skills">Skills</Label>
                    <Input
                      id="creature-skills"
                      value={editingStatBlock.creature.skills || ''}
                      onChange={(e) => updateCreature({ skills: e.target.value })}
                      placeholder="e.g., Perception +4"
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="creature-senses">Senses</Label>
                    <Input
                      id="creature-senses"
                      value={editingStatBlock.creature.senses || ''}
                      onChange={(e) => updateCreature({ senses: e.target.value })}
                      placeholder="e.g., Darkvision 60 ft."
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="creature-languages">Languages</Label>
                    <Input
                      id="creature-languages"
                      value={editingStatBlock.creature.languages || ''}
                      onChange={(e) => updateCreature({ languages: e.target.value })}
                      placeholder="e.g., Common, Elvish"
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="creature-cr">CR</Label>
                    <Input
                      id="creature-cr"
                      value={editingStatBlock.creature.cr}
                      onChange={(e) => updateCreature({ cr: e.target.value })}
                      placeholder="e.g., 3"
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="creature-resistances">Resistances</Label>
                  <Input
                    id="creature-resistances"
                    value={editingStatBlock.creature.resistances || ''}
                    onChange={(e) => updateCreature({ resistances: e.target.value })}
                    placeholder="e.g., Fire, Cold"
                    className="bg-secondary/50 border-border"
                  />
                </div>

                <div>
                  <Label htmlFor="creature-immunities">Immunities</Label>
                  <Input
                    id="creature-immunities"
                    value={editingStatBlock.creature.immunities || ''}
                    onChange={(e) => updateCreature({ immunities: e.target.value })}
                    placeholder="e.g., Poison"
                    className="bg-secondary/50 border-border"
                  />
                </div>

                <div>
                  <Label htmlFor="creature-gear">Gear</Label>
                  <Input
                    id="creature-gear"
                    value={editingStatBlock.creature.gear || ''}
                    onChange={(e) => updateCreature({ gear: e.target.value })}
                    placeholder="e.g., Longsword, Shield"
                    className="bg-secondary/50 border-border"
                  />
                </div>
              </FancyCard>

              <FancyCard className="p-6 space-y-4">
                <h3 className="text-lg mb-2">Traits & Actions</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Add special abilities, attacks, and other actions this creature can take.
                </p>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Traits</Label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const traits = editingStatBlock.creature.traits || []
                        updateCreature({
                          traits: [...traits, { name: 'New Trait', description: '' }]
                        })
                      }}
                      className="gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Add Trait
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(editingStatBlock.creature.traits || []).map((trait, index) => (
                      <div key={index} className="p-3 bg-secondary/30 rounded-lg border border-border space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={trait.name}
                            onChange={(e) => {
                              const traits = [...(editingStatBlock.creature.traits || [])]
                              traits[index] = { ...traits[index], name: e.target.value }
                              updateCreature({ traits })
                            }}
                            placeholder="Trait name"
                            className="bg-background"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const traits = (editingStatBlock.creature.traits || []).filter((_, i) => i !== index)
                              updateCreature({ traits })
                            }}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          value={trait.description}
                          onChange={(e) => {
                            const traits = [...(editingStatBlock.creature.traits || [])]
                            traits[index] = { ...traits[index], description: e.target.value }
                            updateCreature({ traits })
                          }}
                          placeholder="Description"
                          className="bg-background"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Actions</Label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const actions = editingStatBlock.creature.actions || []
                        updateCreature({
                          actions: [...actions, { name: 'New Action', description: '' }]
                        })
                      }}
                      className="gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Add Action
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(editingStatBlock.creature.actions || []).map((action, index) => (
                      <div key={index} className="p-3 bg-secondary/30 rounded-lg border border-border space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={action.name}
                            onChange={(e) => {
                              const actions = [...(editingStatBlock.creature.actions || [])]
                              actions[index] = { ...actions[index], name: e.target.value }
                              updateCreature({ actions })
                            }}
                            placeholder="Action name"
                            className="bg-background"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const actions = (editingStatBlock.creature.actions || []).filter((_, i) => i !== index)
                              updateCreature({ actions })
                            }}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          value={action.description}
                          onChange={(e) => {
                            const actions = [...(editingStatBlock.creature.actions || [])]
                            actions[index] = { ...actions[index], description: e.target.value }
                            updateCreature({ actions })
                          }}
                          placeholder="Description (e.g., Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.)"
                          className="bg-background"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Bonus Actions</Label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const bonusActions = editingStatBlock.creature.bonusActions || []
                        updateCreature({
                          bonusActions: [...bonusActions, { name: 'New Bonus Action', description: '' }]
                        })
                      }}
                      className="gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Add Bonus Action
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(editingStatBlock.creature.bonusActions || []).map((action, index) => (
                      <div key={index} className="p-3 bg-secondary/30 rounded-lg border border-border space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={action.name}
                            onChange={(e) => {
                              const bonusActions = [...(editingStatBlock.creature.bonusActions || [])]
                              bonusActions[index] = { ...bonusActions[index], name: e.target.value }
                              updateCreature({ bonusActions })
                            }}
                            placeholder="Bonus action name"
                            className="bg-background"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const bonusActions = (editingStatBlock.creature.bonusActions || []).filter((_, i) => i !== index)
                              updateCreature({ bonusActions })
                            }}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          value={action.description}
                          onChange={(e) => {
                            const bonusActions = [...(editingStatBlock.creature.bonusActions || [])]
                            bonusActions[index] = { ...bonusActions[index], description: e.target.value }
                            updateCreature({ bonusActions })
                          }}
                          placeholder="Description"
                          className="bg-background"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Reactions</Label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const reactions = editingStatBlock.creature.reactions || []
                        updateCreature({
                          reactions: [...reactions, { name: 'New Reaction', description: '' }]
                        })
                      }}
                      className="gap-2"
                    >
                      <Plus className="w-3 h-3" />
                      Add Reaction
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(editingStatBlock.creature.reactions || []).map((reaction, index) => (
                      <div key={index} className="p-3 bg-secondary/30 rounded-lg border border-border space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={reaction.name}
                            onChange={(e) => {
                              const reactions = [...(editingStatBlock.creature.reactions || [])]
                              reactions[index] = { ...reactions[index], name: e.target.value }
                              updateCreature({ reactions })
                            }}
                            placeholder="Reaction name"
                            className="bg-background"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const reactions = (editingStatBlock.creature.reactions || []).filter((_, i) => i !== index)
                              updateCreature({ reactions })
                            }}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                        <Input
                          value={reaction.description}
                          onChange={(e) => {
                            const reactions = [...(editingStatBlock.creature.reactions || [])]
                            reactions[index] = { ...reactions[index], description: e.target.value }
                            updateCreature({ reactions })
                          }}
                          placeholder="Description"
                          className="bg-background"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </FancyCard>

              <FancyCard className="p-6">
                <h3 className="text-lg mb-4">Preview</h3>
                <div className="border border-border rounded-lg p-4 bg-secondary/30">
                  <CreatureCard creature={editingStatBlock.creature} name={editingStatBlock.name} />
                </div>
              </FancyCard>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Select a stat block from the library or create a new one to start editing.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MonsterSelector
        open={showMonsterSelector}
        onOpenChange={setShowMonsterSelector}
        onSelect={handleMonsterSelect}
      />
    </div>
  )
}
