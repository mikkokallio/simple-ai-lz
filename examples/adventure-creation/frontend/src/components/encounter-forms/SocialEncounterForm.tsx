import { Adventure, Encounter, NPC, ImportantCheck } from '@/types/adventure'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X, User } from '@phosphor-icons/react'
import { useState } from 'react'
import CommonEncounterFields from './CommonEncounterFields'
import NPCSelector from '@/components/NPCSelector'

interface SocialEncounterFormProps {
  encounter: Encounter
  adventure: Adventure
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

export default function SocialEncounterForm({ encounter, adventure, onUpdate }: SocialEncounterFormProps) {
  const [showNPCSelector, setShowNPCSelector] = useState(false)
  const [newCheckAbility, setNewCheckAbility] = useState('Charisma')
  const [newCheckSkill, setNewCheckSkill] = useState<string>('Persuasion')
  const [newCheckDC, setNewCheckDC] = useState('15')
  const [newCheckDesc, setNewCheckDesc] = useState('')

  const handleAddNPC = (npc: NPC) => {
    const npcs = encounter.npcs || []
    if (!npcs.includes(npc.id)) {
      onUpdate({ npcs: [...npcs, npc.id] })
    }
    setShowNPCSelector(false)
  }

  const removeNPC = (npcId: string) => {
    onUpdate({
      npcs: (encounter.npcs || []).filter(id => id !== npcId)
    })
  }

  const addImportantCheck = () => {
    const newCheck: ImportantCheck = {
      id: crypto.randomUUID(),
      ability: newCheckAbility,
      skill: newCheckSkill && newCheckSkill !== 'none' ? newCheckSkill : undefined,
      dc: parseInt(newCheckDC),
      description: newCheckDesc
    }
    onUpdate({
      importantChecks: [...(encounter.importantChecks || []), newCheck]
    })
    setNewCheckAbility('Charisma')
    setNewCheckSkill('Persuasion')
    setNewCheckDC('15')
    setNewCheckDesc('')
  }

  const removeImportantCheck = (checkId: string) => {
    onUpdate({
      importantChecks: (encounter.importantChecks || []).filter(c => c.id !== checkId)
    })
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-6">
          <CommonEncounterFields encounter={encounter} onUpdate={onUpdate} showStoryXP={true} defaultDuration={15} />

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Important Checks</Label>
              <span className="text-xs text-muted-foreground">Key ability checks</span>
            </div>
            
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 mb-3">
              {(encounter.importantChecks || []).map((check) => (
                <div
                  key={check.id}
                  className="p-3 rounded-lg border-2 border-border bg-secondary/50 relative group"
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => removeImportantCheck(check.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-12 h-12 rounded-md bg-card/50 border border-border flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-foreground">
                        {check.dc}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold uppercase tracking-wide line-clamp-2 mb-1">
                        {check.description}
                      </h3>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="purple" className="text-[10px] px-2 py-0.5 uppercase">
                      {check.ability}
                    </Badge>
                    {check.skill && (
                      <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                        {check.skill}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={() => {
                    setNewCheckAbility('Charisma')
                    setNewCheckSkill('Persuasion')
                    setNewCheckDC('15')
                    setNewCheckDesc('')
                  }}
                >
                  <Plus weight="bold" />
                  Add Ability Check
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-center">Add Ability Check</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Ability</Label>
                      <Select value={newCheckAbility} onValueChange={(val) => {
                        setNewCheckAbility(val)
                        setNewCheckSkill(ABILITY_SKILLS[val][0] || 'none')
                      }}>
                        <SelectTrigger className="bg-secondary/50 border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ABILITIES.map(ability => (
                            <SelectItem key={ability} value={ability}>
                              {ability}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Skill</Label>
                      <Select value={newCheckSkill || 'none'} onValueChange={(val) => setNewCheckSkill(val === 'none' ? '' : val)}>
                        <SelectTrigger className="bg-secondary/50 border-border">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Ability Check)</SelectItem>
                          {ABILITY_SKILLS[newCheckAbility].map((skill) => (
                            <SelectItem key={skill} value={skill}>
                              {skill}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>DC</Label>
                    <Input
                      type="number"
                      min="5"
                      max="30"
                      value={newCheckDC}
                      onChange={(e) => setNewCheckDC(e.target.value)}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={newCheckDesc}
                      onChange={(e) => setNewCheckDesc(e.target.value)}
                      placeholder="Why might this check be needed?"
                      rows={3}
                      className="bg-secondary/50 border-border"
                    />
                  </div>
                  <Button
                    onClick={addImportantCheck}
                    disabled={!newCheckDesc.trim()}
                    variant="default"
                    className="gap-2 w-full"
                  >
                    <Plus weight="bold" />
                    Add Check
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>NPC Participants</Label>
              <span className="text-xs text-muted-foreground">NPCs involved in this encounter</span>
            </div>
            
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 mb-3">
              {(encounter.npcs || []).map((npcId) => {
                const npc = adventure.npcs.find(n => n.id === npcId)
                if (!npc) return null
                
                return (
                  <div
                    key={npcId}
                    className="p-3 rounded-lg border-2 border-border bg-secondary/50 relative group"
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => removeNPC(npcId)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    
                    <div className="flex items-start gap-3">
                      {npc.portraitUrl ? (
                        <img
                          src={npc.portraitUrl}
                          alt={npc.name}
                          className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-card/50 border border-border flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold uppercase tracking-wide line-clamp-1 mb-1">
                          {npc.name}
                        </h3>
                        <div className="flex items-center gap-1 flex-wrap">
                          {npc.role && (
                            <Badge variant="purple" className="text-[10px] px-2 py-0.5">
                              {npc.role}
                            </Badge>
                          )}
                          {npc.creature?.cr && (
                            <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                              CR {npc.creature.cr}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button
              onClick={() => setShowNPCSelector(true)}
              variant="default"
              className="gap-2 w-full"
              disabled={adventure.npcs.length === 0}
            >
              <User weight="fill" />
              Add NPC
            </Button>
          </div>
        </CardContent>
      </Card>

      <NPCSelector
        open={showNPCSelector}
        onOpenChange={setShowNPCSelector}
        npcs={adventure.npcs}
        onSelect={handleAddNPC}
      />
    </>
  )
}
