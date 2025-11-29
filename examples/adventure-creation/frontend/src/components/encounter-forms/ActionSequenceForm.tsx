import { Encounter, EncounterAction, ActionSequenceType } from '@/types/adventure'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from '@phosphor-icons/react'
import CommonEncounterFields from './CommonEncounterFields'
import { ACTION_SEQUENCE_TYPES } from '@/lib/encounter-types'

interface ActionSequenceFormProps {
  encounter: Encounter
  onUpdate: (updates: Partial<Encounter>) => void
}

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
const ABILITY_SKILLS: Record<string, string[]> = {
  Strength: ['Athletics'],
  Dexterity: ['Acrobatics', 'Sleight of Hand', 'Stealth'],
  Constitution: [],
  Intelligence: ['Arcana', 'History', 'Investigation', 'Nature', 'Religion'],
  Wisdom: ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival'],
  Charisma: ['Deception', 'Intimidation', 'Performance', 'Persuasion'],
}

export default function ActionSequenceForm({ encounter, onUpdate }: ActionSequenceFormProps) {
  const actions = encounter.actions || []

  const addSkillCheck = () => {
    const newAction: EncounterAction = {
      id: crypto.randomUUID(),
      type: 'skill-check',
      ability: 'Dexterity',
      skill: 'Stealth',
      dc: 15,
      description: ''
    }
    onUpdate({ actions: [...actions, newAction] })
  }

  const addOtherAction = () => {
    const newAction: EncounterAction = {
      id: crypto.randomUUID(),
      type: 'other',
      description: ''
    }
    onUpdate({ actions: [...actions, newAction] })
  }

  const updateAction = (id: string, updates: Partial<EncounterAction>) => {
    onUpdate({
      actions: actions.map(a => a.id === id ? { ...a, ...updates } : a)
    })
  }

  const removeAction = (id: string) => {
    onUpdate({
      actions: actions.filter(a => a.id !== id)
    })
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <CommonEncounterFields encounter={encounter} onUpdate={onUpdate} showStoryXP={true} defaultDuration={15} />

        <div>
          <Label htmlFor="action-sequence-type">Action Sequence Type</Label>
          <Select
            value={encounter.actionSequenceType || 'chase'}
            onValueChange={(value: ActionSequenceType) =>
              onUpdate({ actionSequenceType: value })
            }
          >
            <SelectTrigger className="bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_SEQUENCE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="rules">Rules</Label>
          <Textarea
            id="rules"
            value={encounter.rules || ''}
            onChange={(e) => onUpdate({ rules: e.target.value })}
            placeholder="Describe the rules and mechanics for this action sequence"
            rows={3}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Actions</Label>
            <span className="text-xs text-muted-foreground">Skill checks and other actions</span>
          </div>
          
          <div className="space-y-3 mb-3">
            {actions.map((action) => (
              <div
                key={action.id}
                className="p-4 rounded-lg border-2 border-border bg-secondary/50 relative group"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => removeAction(action.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>

                {action.type === 'skill-check' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="purple">Skill Check</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Ability</Label>
                        <Select
                          value={action.ability || 'Dexterity'}
                          onValueChange={(value) => updateAction(action.id, { 
                            ability: value,
                            skill: ABILITY_SKILLS[value]?.[0] || undefined
                          })}
                        >
                          <SelectTrigger className="bg-secondary/50 border-border h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ABILITIES.map((ability) => (
                              <SelectItem key={ability} value={ability}>
                                {ability}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Skill</Label>
                        <Select
                          value={action.skill || ''}
                          onValueChange={(value) => updateAction(action.id, { skill: value })}
                        >
                          <SelectTrigger className="bg-secondary/50 border-border h-8 text-xs">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None (Save)</SelectItem>
                            {ABILITY_SKILLS[action.ability || 'Dexterity']?.map((skill) => (
                              <SelectItem key={skill} value={skill}>
                                {skill}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">DC</Label>
                        <Input
                          type="number"
                          value={action.dc || 15}
                          onChange={(e) => updateAction(action.id, { dc: parseInt(e.target.value) || 15 })}
                          className="h-8 text-xs"
                          min="1"
                          max="30"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={action.description}
                        onChange={(e) => updateAction(action.id, { description: e.target.value })}
                        placeholder="What does this check represent?"
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="golden">Other Action</Badge>
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Textarea
                        value={action.description}
                        onChange={(e) => updateAction(action.id, { description: e.target.value })}
                        placeholder="Describe this action"
                        rows={3}
                        className="text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={addSkillCheck}
              variant="default"
              className="gap-2"
            >
              <Plus weight="bold" />
              Add Skill Check
            </Button>
            <Button
              onClick={addOtherAction}
              variant="default"
              className="gap-2"
            >
              <Plus weight="bold" />
              Add Other Action
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="consequences">Consequences</Label>
          <Textarea
            id="consequences"
            value={encounter.actionConsequences || ''}
            onChange={(e) => onUpdate({ actionConsequences: e.target.value })}
            placeholder="What happens on success or failure?"
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  )
}
