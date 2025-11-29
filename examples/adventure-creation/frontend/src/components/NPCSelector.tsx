import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { User, MagnifyingGlass, Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { NPC } from '@/types/adventure'
import { FancyCard } from '@/components/FancyCard'

interface NPCSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  npcs: NPC[]
  selectedNPCIds?: string[]
  onSelect: (npcId: string) => void
  multiSelect?: boolean
  title?: string
  description?: string
}

export default function NPCSelector({
  open,
  onOpenChange,
  npcs,
  selectedNPCIds = [],
  onSelect,
  multiSelect = false,
  title = 'Select NPC',
  description = 'Choose an NPC from your library'
}: NPCSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredNPCs = npcs.filter(npc =>
    npc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (npc.role && npc.role.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const availableNPCs = multiSelect 
    ? filteredNPCs 
    : filteredNPCs.filter(npc => !selectedNPCIds.includes(npc.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
          {description && <DialogDescription className="text-center">{description}</DialogDescription>}
        </DialogHeader>

        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search NPCs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary/50 border-border"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {availableNPCs.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {npcs.length === 0 
                ? 'No NPCs created yet. Visit the NPCs page to create characters.'
                : 'No NPCs match your search.'}
            </div>
          )}
          
          {availableNPCs.map((npc) => {
            const isSelected = selectedNPCIds.includes(npc.id)
            return (
              <FancyCard
                key={npc.id}
                hoverable
                onClick={() => onSelect(npc.id)}
                className={`p-4 cursor-pointer transition-all ${
                  isSelected ? 'ring-2 ring-[oklch(0.35_0.08_300)] bg-[oklch(0.35_0.08_300)]/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-5 h-5 text-[oklch(0.50_0.08_300)]" weight="duotone" />
                      <h3 className="font-semibold">{npc.name}</h3>
                      {!npc.creature && (
                        <div className="flex items-center gap-1 text-xs text-yellow-500">
                          <Warning className="w-3 h-3" weight="fill" />
                          <span>No stats</span>
                        </div>
                      )}
                    </div>
                    
                    {npc.role && (
                      <p className="text-sm text-muted-foreground mb-2">{npc.role}</p>
                    )}
                    
                    {npc.appearance && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{npc.appearance}</p>
                    )}
                    
                    <div className="flex flex-wrap gap-1 mt-2">
                      {npc.creature && (
                        <Badge variant="outline" className="text-xs">
                          CR {npc.creature.cr}
                        </Badge>
                      )}
                      {npc.secrets && npc.secrets.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {npc.secrets.length} secret{npc.secrets.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {npc.portraitUrl && (
                    <img
                      src={npc.portraitUrl}
                      alt={npc.name}
                      className="w-16 h-16 rounded-lg object-cover border border-border"
                    />
                  )}
                </div>
              </FancyCard>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
