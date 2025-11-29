import { Adventure, NPC, Creature } from '@/types/adventure'
import { useAuth } from '@/contexts/AuthContext'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Plus, Sparkle, Image as ImageIcon, User, Sword, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { FancyCard } from '@/components/FancyCard'
import EmptyState from '@/components/EmptyState'
import { StatBadge } from '@/components/StatBadge'
import { generatePortrait } from '@/lib/dalle'
import { toast } from 'sonner'
import CreatureCard from '@/components/CreatureCard'
import MonsterSelector from '@/components/MonsterSelector'
import type { MonsterMetadata } from '@/lib/monsterParser'
import { cn } from '@/lib/utils'
import { addPortraitToGallery } from '@/lib/portraitGallery'
import PortraitGalleryModal from '@/components/PortraitGalleryModal'

interface NPCsStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function NPCsStage({ adventure, updateAdventure }: NPCsStageProps) {
  const { user } = useAuth()
  const isPremiumOrAdmin = user?.role === 'premium' || user?.role === 'admin'
  
  const [npcName, setNpcName] = useState('')
  const [viewingNPC, setViewingNPC] = useState<NPC | null>(null)
  const [editingField, setEditingField] = useState<{ npcId: string; field: string; value: string } | null>(null)
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [showMonsterSelector, setShowMonsterSelector] = useState(false)
  const [showPortraitGallery, setShowPortraitGallery] = useState(false)

  const addNPC = () => {
    if (npcName.trim()) {
      const newNPC: NPC = {
        id: crypto.randomUUID(),
        name: npcName.trim(),
        role: '',
        appearance: '',
        personality: '',
        secrets: [],
        relationships: [],
      }
      updateAdventure({
        npcs: [...adventure.npcs, newNPC],
      })
      setNpcName('')
      setViewingNPC(newNPC)
      setActiveTab('details')
    }
  }

  const updateNPC = (id: string, updates: Partial<NPC>) => {
    updateAdventure({
      npcs: adventure.npcs.map((npc) => (npc.id === id ? { ...npc, ...updates } : npc)),
    })
    if (viewingNPC?.id === id) {
      setViewingNPC({ ...viewingNPC, ...updates })
    }
  }

  const deleteNPC = (id: string) => {
    const updatedNPCs = adventure.npcs.filter((npc) => npc.id !== id)
    updateAdventure({
      npcs: updatedNPCs,
    })
    setViewingNPC(null)
    toast.success('NPC deleted')
  }

  const openEditField = (npcId: string, field: string, currentValue: string) => {
    setEditingField({ npcId, field, value: currentValue })
  }

  const saveEditField = () => {
    if (!editingField) return
    
    const updates: Partial<NPC> = {
      [editingField.field]: editingField.value
    }
    
    updateNPC(editingField.npcId, updates)
    setEditingField(null)
    toast.success('Updated successfully')
  }

  const handleMonsterSelect = (creature: Creature, name: string, metadata: MonsterMetadata) => {
    if (!viewingNPC) return
    updateNPC(viewingNPC.id, { creature })
    setShowMonsterSelector(false)
    toast.success(`Added ${name} stats to ${viewingNPC.name}`)
  }

  const addCreatureStats = () => {
    setShowMonsterSelector(true)
  }

  const removeCreatureStats = () => {
    if (!viewingNPC) return
    updateNPC(viewingNPC.id, { creature: undefined })
    toast.success('Removed creature stats')
  }

  const handleGeneratePortrait = async () => {
    if (!viewingNPC) return

    setIsGeneratingPortrait(true)
    try {
      const description = viewingNPC.appearance
      const portraitUrl = await generatePortrait(description, viewingNPC.name)
      
      // Add to gallery for future use
      addPortraitToGallery(portraitUrl, description, viewingNPC.name)
      
      updateNPC(viewingNPC.id, { portraitUrl })
      toast.success('Portrait generated and added to gallery!')
    } catch (error) {
      console.error('Portrait generation error:', error)
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred'
      
      toast.error(`Failed to generate portrait: ${errorMessage}`, {
        duration: 5000,
      })
    } finally {
      setIsGeneratingPortrait(false)
    }
  }

  const handleSelectFromGallery = (portraitUrl: string) => {
    if (!viewingNPC) return
    updateNPC(viewingNPC.id, { portraitUrl })
    setShowPortraitGallery(false)
  }

  const isEmpty = adventure.npcs.length === 0

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="mb-2">NPCs & Creatures</h2>
          <p className="text-muted-foreground">Populate your world with characters</p>
        </div>

        <EmptyState
          icon={User}
          title="Create Your First NPC"
          description="Add characters to bring your adventure to life. The AI can help you develop their personalities, backgrounds, and even generate portraits."
          action={
            <div className="max-w-md mx-auto">
              <div className="flex gap-2">
                <Input
                  value={npcName}
                  onChange={(e) => setNpcName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNPC()}
                  placeholder="Enter NPC name..."
                />
                <Button onClick={addNPC} variant="default" className="gap-2">
                  <Plus weight="bold" /> Add NPC
                </Button>
              </div>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-2">NPCs & Creatures</h2>
          <p className="text-muted-foreground">Populate your world with characters</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="default" className="gap-2">
              <Plus weight="bold" /> Add NPC
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-center">Create New NPC</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-npc-name">Name</Label>
                <Input
                  id="new-npc-name"
                  value={npcName}
                  onChange={(e) => setNpcName(e.target.value)}
                  placeholder="NPC name..."
                />
              </div>
              <Button onClick={addNPC} variant="default" className="w-full gap-2">
                <Plus weight="bold" /> Create NPC
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {adventure.npcs.map((npc) => (
          <Dialog key={npc.id} open={viewingNPC?.id === npc.id} onOpenChange={(open) => !open && setViewingNPC(null)}>
            <DialogTrigger asChild>
              <div 
                onClick={() => { setViewingNPC(npc); setActiveTab('details'); }} 
                className="p-3 rounded-lg border-2 border-border bg-secondary/50 cursor-pointer transition-all hover:scale-105 hover:border-accent/50"
              >
                <div className="flex items-start gap-3 mb-2">
                  {npc.portraitUrl ? (
                    <img src={npc.portraitUrl} alt={npc.name} className="w-12 h-12 rounded-md object-cover border border-border" />
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
                {npc.role && (
                  <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                    {npc.role}
                  </Badge>
                )}
                {!npc.role && <p className="text-[10px] text-muted-foreground line-clamp-1">No role assigned</p>}
              </div>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-center">{npc.name}</DialogTitle>
              </DialogHeader>
              {viewingNPC && viewingNPC.id === npc.id && (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="elegant-tabs-list w-full justify-start">
                    <TabsTrigger value="details" className="elegant-tab-trigger">Character Details</TabsTrigger>
                    <TabsTrigger value="creature" className="elegant-tab-trigger">
                      <Sword className="w-4 h-4 mr-2" />
                      Creature Stats
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="details" className="space-y-4">
                    {/* Name Field */}
                    <div 
                      className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-accent/50 cursor-pointer transition-colors"
                      onClick={() => openEditField(viewingNPC.id, 'name', viewingNPC.name)}
                    >
                      <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
                      <p className="text-base">{viewingNPC.name}</p>
                    </div>

                    {/* Role Field */}
                    <div 
                      className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-accent/50 cursor-pointer transition-colors"
                      onClick={() => openEditField(viewingNPC.id, 'role', viewingNPC.role || '')}
                    >
                      <Label className="text-xs text-muted-foreground mb-1 block">Role</Label>
                      <p className="text-base">{viewingNPC.role || <span className="text-muted-foreground italic">Click to add role</span>}</p>
                    </div>

                    {/* Appearance Field */}
                    <div 
                      className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-accent/50 cursor-pointer transition-colors"
                      onClick={() => openEditField(viewingNPC.id, 'appearance', viewingNPC.appearance || '')}
                    >
                      <Label className="text-xs text-muted-foreground mb-1 block">Appearance</Label>
                      <p className="text-base whitespace-pre-wrap">{viewingNPC.appearance || <span className="text-muted-foreground italic">Click to add appearance</span>}</p>
                    </div>

                    {/* Personality Field */}
                    <div 
                      className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-accent/50 cursor-pointer transition-colors"
                      onClick={() => openEditField(viewingNPC.id, 'personality', viewingNPC.personality || '')}
                    >
                      <Label className="text-xs text-muted-foreground mb-1 block">Personality</Label>
                      <p className="text-base whitespace-pre-wrap">{viewingNPC.personality || <span className="text-muted-foreground italic">Click to add personality</span>}</p>
                    </div>

                    {/* Portrait Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label>Portrait</Label>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setShowPortraitGallery(true)}
                            size="sm"
                            variant="secondary"
                            className="gap-2"
                          >
                            <ImageIcon />
                            Pick a Portrait
                          </Button>
                          {isPremiumOrAdmin && (
                            <Button
                              onClick={handleGeneratePortrait}
                              disabled={isGeneratingPortrait || !viewingNPC.appearance}
                              size="sm"
                              variant="default"
                              className="gap-2"
                            >
                              {isGeneratingPortrait ? (
                                <>
                                  <Sparkle className="animate-spin" weight="fill" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkle weight="fill" />
                                  Generate New Portrait
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      {viewingNPC.portraitUrl && (
                        <img 
                          src={viewingNPC.portraitUrl} 
                          alt={viewingNPC.name} 
                          className="w-full rounded-lg border-2 border-accent/50"
                        />
                      )}
                      {!viewingNPC.portraitUrl && (
                        <div className="w-full h-48 rounded-lg bg-secondary/50 border-2 border-dashed border-border flex items-center justify-center">
                          <div className="text-center">
                            <User className="w-12 h-12 text-muted-foreground mx-auto mb-2" weight="duotone" />
                            <p className="text-sm text-muted-foreground">No portrait yet</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="creature" className="space-y-4">
                    {!viewingNPC.creature ? (
                      <div className="text-center py-8">
                        <Sword className="w-16 h-16 text-muted-foreground mx-auto mb-4" weight="duotone" />
                        <p className="text-muted-foreground mb-4">
                          No creature stats assigned. You can assign stats from the monster library.
                        </p>
                        <Button onClick={addCreatureStats} variant="default" className="gap-2">
                          <Plus />
                          Select from Monster Library
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                          <CreatureCard creature={viewingNPC.creature} name={viewingNPC.name} />
                        <div className="flex gap-2 justify-end">
                          <Button onClick={removeCreatureStats} variant="destructive" className="gap-2">
                            <Trash className="w-4 h-4" />
                            Remove Stats
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
              {viewingNPC && (
                <div className="border-t border-border pt-4 mt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2">
                        <Trash className="w-4 h-4" />
                        Delete NPC
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-center">Delete {viewingNPC.name}</AlertDialogTitle>
                        <AlertDialogDescription className="text-center">
                          This will permanently delete this NPC. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteNPC(viewingNPC.id)} className={cn(buttonVariants({ variant: "destructive" }))}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </DialogContent>
          </Dialog>
        ))}
      </div>

      {/* Monster Selector */}
      <MonsterSelector
        open={showMonsterSelector}
        onOpenChange={setShowMonsterSelector}
        onSelect={handleMonsterSelect}
      />

      {/* Edit Field Modal */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center capitalize">Edit {editingField?.field}</DialogTitle>
          </DialogHeader>
          {editingField && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-field-value" className="capitalize">{editingField.field}</Label>
                {editingField.field === 'name' || editingField.field === 'role' ? (
                  <Input
                    id="edit-field-value"
                    value={editingField.value}
                    onChange={(e) => setEditingField({ ...editingField, value: e.target.value })}
                    className="bg-secondary/50 border-border"
                    autoFocus
                  />
                ) : (
                  <Textarea
                    id="edit-field-value"
                    value={editingField.value}
                    onChange={(e) => setEditingField({ ...editingField, value: e.target.value })}
                    className="bg-secondary/50 border-border"
                    rows={5}
                    autoFocus
                  />
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setEditingField(null)}>
                  Cancel
                </Button>
                <Button onClick={saveEditField} className="bg-primary hover:bg-primary/90">
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Portrait Gallery Modal */}
      <PortraitGalleryModal
        open={showPortraitGallery}
        onOpenChange={setShowPortraitGallery}
        onSelect={handleSelectFromGallery}
      />
    </div>
  )
}
