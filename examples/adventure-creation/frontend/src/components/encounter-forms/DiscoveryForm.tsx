import { Encounter, PointOfInterest, DiscoveryType } from '@/types/adventure'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X, MapPin } from '@phosphor-icons/react'
import CommonEncounterFields from './CommonEncounterFields'
import { DISCOVERY_TYPES } from '@/lib/encounter-types'

interface DiscoveryFormProps {
  encounter: Encounter
  onUpdate: (updates: Partial<Encounter>) => void
}

export default function DiscoveryForm({ encounter, onUpdate }: DiscoveryFormProps) {
  const pointsOfInterest = encounter.pointsOfInterest || []

  const addPointOfInterest = () => {
    const newPOI: PointOfInterest = {
      id: crypto.randomUUID(),
      name: '',
      description: ''
    }
    onUpdate({ pointsOfInterest: [...pointsOfInterest, newPOI] })
  }

  const updatePointOfInterest = (id: string, updates: Partial<PointOfInterest>) => {
    onUpdate({
      pointsOfInterest: pointsOfInterest.map(poi => 
        poi.id === id ? { ...poi, ...updates } : poi
      )
    })
  }

  const removePointOfInterest = (id: string) => {
    onUpdate({
      pointsOfInterest: pointsOfInterest.filter(poi => poi.id !== id)
    })
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <CommonEncounterFields encounter={encounter} onUpdate={onUpdate} showStoryXP={true} defaultDuration={15} />

        <div>
          <Label htmlFor="discovery-type">Discovery Type</Label>
          <Select
            value={encounter.discoveryType || 'area-exploration'}
            onValueChange={(value: DiscoveryType) =>
              onUpdate({ discoveryType: value })
            }
          >
            <SelectTrigger className="bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISCOVERY_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Points of Interest</Label>
            <span className="text-xs text-muted-foreground">
              Locations, clues, or items to discover
            </span>
          </div>
          
          <div className="space-y-3 mb-3">
            {pointsOfInterest.map((poi) => (
              <div
                key={poi.id}
                className="p-4 rounded-lg border-2 border-border bg-secondary/50 relative group"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => removePointOfInterest(poi.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin weight="fill" className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Point of Interest</span>
                  </div>
                  
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={poi.name}
                      onChange={(e) => updatePointOfInterest(poi.id, { name: e.target.value })}
                      placeholder="Ancient Statue, Hidden Door, Cryptic Inscription..."
                      className="text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={poi.description}
                      onChange={(e) => updatePointOfInterest(poi.id, { description: e.target.value })}
                      placeholder="What do the characters find? What can they learn or discover here?"
                      rows={3}
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}

            {pointsOfInterest.length === 0 && (
              <div className="p-8 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
                No points of interest yet. Add locations, clues, or items to discover.
              </div>
            )}
          </div>

          <Button
            onClick={addPointOfInterest}
            variant="default"
            className="w-full gap-2"
          >
            <Plus weight="bold" />
            Add Point of Interest
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
