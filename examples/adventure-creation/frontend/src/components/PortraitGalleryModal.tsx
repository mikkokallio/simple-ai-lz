import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { getPortraitGallery, searchPortraits, removePortraitFromGallery, type PortraitEntry } from '@/lib/portraitGallery'
import { MagnifyingGlass, Trash, Check, Image as ImageIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface PortraitGalleryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (portraitUrl: string) => void
}

export default function PortraitGalleryModal({ open, onOpenChange, onSelect }: PortraitGalleryModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [portraits, setPortraits] = useState<PortraitEntry[]>([])
  const [selectedPortrait, setSelectedPortrait] = useState<string | null>(null)

  // Load portraits when modal opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setPortraits(getPortraitGallery())
      setSearchQuery('')
      setSelectedPortrait(null)
    }
    onOpenChange(isOpen)
  }

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      setPortraits(searchPortraits(query))
    } else {
      setPortraits(getPortraitGallery())
    }
  }

  // Handle portrait selection
  const handleSelectPortrait = () => {
    if (selectedPortrait) {
      onSelect(selectedPortrait)
      toast.success('Portrait selected!')
      onOpenChange(false)
    }
  }

  // Handle portrait deletion
  const handleDeletePortrait = (portraitId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    removePortraitFromGallery(portraitId)
    setPortraits(prev => prev.filter(p => p.id !== portraitId))
    if (selectedPortrait) {
      const deletedPortrait = portraits.find(p => p.id === portraitId)
      if (deletedPortrait?.url === selectedPortrait) {
        setSelectedPortrait(null)
      }
    }
    toast.success('Portrait removed from gallery')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center">Portrait Gallery</DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by character name or description..."
            className="pl-10 bg-secondary/50 border-border"
          />
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto pr-2">
          {portraits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" weight="duotone" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery ? 'No portraits found' : 'No portraits in gallery'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {searchQuery 
                  ? 'Try a different search term'
                  : 'Generate portraits for your NPCs to build your gallery'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {portraits.map((portrait) => (
                <div
                  key={portrait.id}
                  onClick={() => setSelectedPortrait(portrait.url)}
                  className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                    selectedPortrait === portrait.url
                      ? 'border-accent shadow-lg shadow-accent/20'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  {/* Portrait Image */}
                  <div className="aspect-square relative bg-secondary/50">
                    <img
                      src={portrait.url}
                      alt={portrait.characterName || 'Portrait'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    
                    {/* Selected Indicator */}
                    {selectedPortrait === portrait.url && (
                      <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                          <Check className="w-6 h-6 text-accent-foreground" weight="bold" />
                        </div>
                      </div>
                    )}
                    
                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDeletePortrait(portrait.id, e)}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                      title="Remove from gallery"
                    >
                      <Trash className="w-4 h-4" weight="bold" />
                    </button>
                  </div>

                  {/* Portrait Info */}
                  <div className="p-2 bg-card/80 backdrop-blur-sm">
                    {portrait.characterName && (
                      <Badge variant="outline" className="text-[10px] mb-1">
                        {portrait.characterName}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {portrait.prompt}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(portrait.generatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t border-border">
          <Button
            onClick={handleSelectPortrait}
            disabled={!selectedPortrait}
            className="flex-1 gap-2"
          >
            <Check weight="bold" />
            Select Portrait
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
