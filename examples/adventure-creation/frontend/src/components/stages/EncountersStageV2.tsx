import { Adventure, Encounter } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Sword, MapTrifold, ArrowLeft, Plus, Trash, Eye } from '@phosphor-icons/react'
import { useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { getEncounterTemplate } from '@/lib/encounter-templates'
import { calculateEncounterStats } from '@/lib/encounterCalculator'
import { cn } from '@/lib/utils'
import { getEncounterTypeInfo } from '@/lib/encounter-types'
import TacticalEncounterForm from '@/components/encounter-forms/TacticalEncounterForm'
import SocialEncounterForm from '@/components/encounter-forms/SocialEncounterForm'
import ActionSequenceForm from '@/components/encounter-forms/ActionSequenceForm'
import DiscoveryForm from '@/components/encounter-forms/DiscoveryForm'
import CinematicForm from '@/components/encounter-forms/CinematicForm'

interface EncountersStageV2Props {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

type CreatureReference = {
  id: string
  name: string
  creature: any
}

export default function EncountersStageV2({ adventure, updateAdventure }: EncountersStageV2Props) {
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(
    adventure.selectedEncounterId || (adventure.structure.encounters.length > 0 ? adventure.structure.encounters[0].id : null)
  )
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleSelectEncounter = (encounterId: string) => {
    setSelectedEncounterId(encounterId)
    updateAdventure({ selectedEncounterId: encounterId })
  }

  const selectedEncounter = adventure.structure.encounters.find(e => e.id === selectedEncounterId)

  const updateEncounter = (id: string, updates: Partial<Encounter>) => {
    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: adventure.structure.encounters.map((enc) => (enc.id === id ? { ...enc, ...updates } : enc)),
      }
    })
  }

  const handleEncounterUpdate = (updates: Partial<Encounter>) => {
    if (selectedEncounterId) {
      updateEncounter(selectedEncounterId, updates)
    }
  }

  const navigateToStructure = () => {
    updateAdventure({ 
      stage: 'structure',
      selectedEncounterId: selectedEncounterId || undefined
    })
  }

  const handleNewEncounter = () => {
    // Calculate position for new encounter to avoid overlap
    const existingEncounters = adventure.structure.encounters
    let xPosition = 300
    let yPosition = 200
    
    // If there are existing encounters, place it below/right of them
    if (existingEncounters.length > 0) {
      const maxY = Math.max(...existingEncounters.map(e => e.yPosition || 200))
      yPosition = maxY + 150 // Place 150px below the lowest encounter
      xPosition = 300 + (existingEncounters.length % 3) * 200 // Stagger horizontally
    }

    const newEncounter: Encounter = {
      id: crypto.randomUUID(),
      title: 'New Encounter',
      name: 'New Encounter',
      description: '',
      type: 'tactical',
      difficulty: 'medium',
      xPosition,
      yPosition,
    }
    const updatedEncounters = [...adventure.structure.encounters, newEncounter]
    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: updatedEncounters,
      },
      selectedEncounterId: newEncounter.id,
    })
    setSelectedEncounterId(newEncounter.id)
  }

  const handleDeleteEncounter = () => {
    if (!selectedEncounterId) return
    
    const updatedEncounters = adventure.structure.encounters.filter(
      (e) => e.id !== selectedEncounterId
    )
    const updatedConnections = adventure.structure.connections.filter(
      (c) => c.from !== selectedEncounterId && c.to !== selectedEncounterId
    )
    
    updateAdventure({
      structure: {
        encounters: updatedEncounters,
        connections: updatedConnections,
      },
      selectedEncounterId: updatedEncounters.length > 0 ? updatedEncounters[0].id : null,
    })
    setSelectedEncounterId(updatedEncounters.length > 0 ? updatedEncounters[0].id : null)
    setDeleteDialogOpen(false)
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-2">Encounters</h2>
          <p className="text-muted-foreground">Design balanced challenges and add creatures</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={navigateToStructure} variant="secondary" className="gap-2">
            <Eye weight="bold" />
            View on Canvas
          </Button>
          <Button onClick={handleNewEncounter} variant="secondary" className="gap-2">
            <Plus weight="bold" />
            New Encounter
          </Button>
          <Button 
            onClick={() => setDeleteDialogOpen(true)} 
            variant="destructive" 
            size="icon"
            disabled={!selectedEncounterId}
            title="Delete Encounter"
          >
            <Trash weight="bold" />
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Encounters List Sidebar */}
        <div className="w-64 flex-shrink-0 overflow-hidden flex flex-col mt-8">
          <div className="flex-1 overflow-y-auto space-y-2">
            {adventure.structure.encounters.map((encounter) => {
              const template = getEncounterTemplate(encounter.type)
              const Icon = template.icon
              
              const encounterXP = (() => {
                if (encounter.type === 'tactical' || encounter.type === 'combat') {
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
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {selectedEncounter ? (
            <div className="relative mt-8">
              {/* Decorative Glass Orb with Encounter Icon */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-8 z-10">
                <div className="relative w-16 h-16">
                  {/* Glass orb effect */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm border-2 border-border shadow-lg"></div>
                  {/* Inner glow */}
                  <div className="absolute inset-1 rounded-full bg-gradient-to-br from-background/50 to-transparent"></div>
                  {/* Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {(() => {
                      const typeInfo = getEncounterTypeInfo(selectedEncounter.type)
                      if (!typeInfo) return null
                      const Icon = typeInfo.icon
                      return <Icon className={cn('w-8 h-8', typeInfo.color)} weight="duotone" />
                    })()}
                  </div>
                </div>
              </div>

              {/* Card with Navigation Button */}
              <Card className="pt-12 border-2">
                <CardContent className="space-y-6">
                  {/* Navigation Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={navigateToStructure}
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Structure Canvas
                    </Button>
                  </div>

                  {/* Conditionally render the appropriate form component based on encounter type */}
                  {selectedEncounter.type === 'tactical' && (
                    <TacticalEncounterForm
                      encounter={selectedEncounter}
                      adventure={adventure}
                      onUpdate={handleEncounterUpdate}
                      onUpdateAdventure={updateAdventure}
                    />
                  )}

                  {selectedEncounter.type === 'social' && (
                    <SocialEncounterForm
                      encounter={selectedEncounter}
                      adventure={adventure}
                      onUpdate={handleEncounterUpdate}
                    />
                  )}

                  {selectedEncounter.type === 'action-sequence' && (
                    <ActionSequenceForm
                      encounter={selectedEncounter}
                      onUpdate={handleEncounterUpdate}
                    />
                  )}

                  {selectedEncounter.type === 'discovery' && (
                    <DiscoveryForm
                      encounter={selectedEncounter}
                      onUpdate={handleEncounterUpdate}
                    />
                  )}

                  {selectedEncounter.type === 'cinematic' && (
                    <CinematicForm
                      encounter={selectedEncounter}
                      onUpdate={handleEncounterUpdate}
                    />
                  )}

                  {/* Fallback for old encounter types (combat, skill-challenge, etc.) */}
                  {!['tactical', 'social', 'action-sequence', 'discovery', 'cinematic'].includes(selectedEncounter.type) && (
                    <div className="text-center text-muted-foreground py-6">
                      <p className="mb-2">This encounter uses an older type: <span className="font-semibold">{selectedEncounter.type}</span></p>
                      <p className="text-sm">Please update the encounter type in the Structure canvas to use the new forms.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyState
              icon={Sword}
              title="Select an Encounter"
              description="Choose an encounter from the list to edit its details"
            />
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Encounter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedEncounter?.title || 'this encounter'}" and all its connections. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteEncounter} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
