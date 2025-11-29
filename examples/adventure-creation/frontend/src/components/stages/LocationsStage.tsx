import { Adventure } from '@/types/adventure'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'

interface LocationsStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

export default function LocationsStage({ adventure, updateAdventure }: LocationsStageProps) {
  const [locationName, setLocationName] = useState('')

  const addLocation = () => {
    if (locationName.trim()) {
      updateAdventure({
        locations: [
          ...adventure.locations,
          {
            id: crypto.randomUUID(),
            name: locationName.trim(),
            type: 'General',
            description: '',
            scenes: [],
          },
        ],
      })
      setLocationName('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Secret DM Tools</h2>
        <p className="text-muted-foreground">Manage locations and other campaign elements</p>
      </div>

      <Card className="parchment-texture border-2">
        <CardHeader>
          <CardTitle>Add Location</CardTitle>
          <CardDescription>Create a new location for your adventure</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()}
              placeholder="Location name..."
            />
            <Button onClick={addLocation} className="gap-2">
              <Plus /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {adventure.locations.map((location) => (
          <Card key={location.id} className="parchment-texture border-2">
            <CardHeader>
              <CardTitle>{location.name}</CardTitle>
              <CardDescription>{location.type}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {location.scenes.length} scene(s)
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
