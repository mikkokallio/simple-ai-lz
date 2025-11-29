import { Encounter } from '@/types/adventure'
import CommonEncounterFields from './CommonEncounterFields'

interface CinematicFormProps {
  encounter: Encounter
  onUpdate: (updates: Partial<Encounter>) => void
}

export default function CinematicForm({ encounter, onUpdate }: CinematicFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        Cinematic encounters are story moments, cutscenes, and dramatic reveals that don't require
        mechanics or player choices. Perfect for opening scenes, transitions, and climactic moments.
      </div>
      
      <CommonEncounterFields encounter={encounter} onUpdate={onUpdate} />
    </div>
  )
}
