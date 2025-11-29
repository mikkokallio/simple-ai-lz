import { Encounter } from '@/types/adventure'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CommonEncounterFieldsProps {
  encounter: Encounter
  onUpdate: (updates: Partial<Encounter>) => void
  showStoryXP?: boolean
  defaultDuration?: number
  rightSlot?: React.ReactNode
}

const DURATION_OPTIONS = [
  { value: 5, label: '5 mins' },
  { value: 15, label: '15 mins' },
  { value: 30, label: '30 mins' },
  { value: 45, label: '45 mins' },
  { value: 60, label: '60 mins' },
]

export default function CommonEncounterFields({ 
  encounter, 
  onUpdate, 
  showStoryXP = false,
  defaultDuration = 15,
  rightSlot
}: CommonEncounterFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={encounter.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Encounter title"
          />
        </div>

        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={encounter.location || ''}
            onChange={(e) => onUpdate({ location: e.target.value })}
            placeholder="Where does this take place?"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={encounter.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="What happens in this encounter?"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="duration">Duration</Label>
          <Select
            value={String(encounter.durationMinutes || defaultDuration)}
            onValueChange={(value) => onUpdate({ durationMinutes: parseInt(value) })}
          >
            <SelectTrigger id="duration" className="bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {rightSlot ? rightSlot : showStoryXP && (
          <div>
            <Label htmlFor="story-xp">Story XP</Label>
            <Input
              id="story-xp"
              type="number"
              min="0"
              step="1"
              value={encounter.storyXP ?? 0}
              onChange={(e) => onUpdate({ storyXP: e.target.value ? parseInt(e.target.value) : 0 })}
              placeholder="Enter XP value..."
            />
          </div>
        )}
        {!rightSlot && !showStoryXP && <div></div>}
      </div>
    </div>
  )
}
