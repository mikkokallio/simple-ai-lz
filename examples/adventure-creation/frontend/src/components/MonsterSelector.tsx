import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Creature } from '@/types/adventure'
import { MonsterMetadata, loadMonsterFromFile } from '@/lib/monsterParser'
import { Sword, MagnifyingGlass, X, Sparkle } from '@phosphor-icons/react'

interface MonsterSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (creature: Creature, name: string, metadata: MonsterMetadata) => void
}

const COMBAT_ROLES = [
  'all',
  'striker',
  'controller',
  'skirmisher',
  'tank',
  'artillery',
  'support',
  'infiltrator',
]

const CR_RANGES = [
  { label: 'All CR', min: -1, max: 999 },
  { label: 'CR 0-1', min: 0, max: 1 },
  { label: 'CR 2-4', min: 2, max: 4 },
  { label: 'CR 5-10', min: 5, max: 10 },
  { label: 'CR 11-16', min: 11, max: 16 },
  { label: 'CR 17-20', min: 17, max: 20 },
  { label: 'CR 21+', min: 21, max: 999 },
]

const CREATURE_TYPES = [
  'all',
  'beast',
  'undead',
  'fiend',
  'celestial',
  'elemental',
  'fey',
  'aberration',
  'construct',
  'dragon',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
]

function parseCR(cr: string): number {
  if (cr.includes('/')) {
    const [num, den] = cr.split('/').map(Number)
    return num / den
  }
  return parseFloat(cr)
}

export default function MonsterSelector({ open, onOpenChange, onSelect }: MonsterSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [selectedCRRange, setSelectedCRRange] = useState(0)
  const [selectedType, setSelectedType] = useState('all')
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [monsterList, setMonsterList] = useState<MonsterMetadata[]>([])

  useEffect(() => {
    setIsLoadingList(true)
    fetch('/monsters-metadata.json')
      .then((res) => res.json())
      .then((data) => {
        const filtered = (data.monsters as MonsterMetadata[]).filter(
          (m) => m.name !== 'Vampire Familiar'
        )
        setMonsterList(filtered)
        setIsLoadingList(false)
      })
      .catch((err) => {
        console.error('Error loading monster metadata:', err)
        setIsLoadingList(false)
      })
  }, [])

  const monsters = monsterList

  const filteredMonsters = useMemo(() => {
    return monsters.filter((monster) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!monster.name.toLowerCase().includes(query) && 
            !monster.summary.toLowerCase().includes(query)) {
          return false
        }
      }

      if (selectedRole !== 'all' && monster.combat_role !== selectedRole) {
        return false
      }

      const crRange = CR_RANGES[selectedCRRange]
      const monsterCR = parseCR(monster.cr)
      if (crRange.min >= 0 && (monsterCR < crRange.min || monsterCR > crRange.max)) {
        return false
      }

      if (selectedType !== 'all') {
        const hasType = monster.theme_keywords.includes(selectedType) || 
                       monster.creature_type.toLowerCase().includes(selectedType)
        if (!hasType) return false
      }

      if (selectedKeywords.length > 0) {
        const hasAllKeywords = selectedKeywords.every((kw) =>
          monster.theme_keywords.includes(kw)
        )
        if (!hasAllKeywords) return false
      }

      return true
    })
  }, [monsters, searchQuery, selectedRole, selectedCRRange, selectedType, selectedKeywords])

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword]
    )
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedRole('all')
    setSelectedCRRange(0)
    setSelectedType('all')
    setSelectedKeywords([])
  }

  const handleSelect = async (monster: MonsterMetadata) => {
    setIsLoading(true)
    try {
      const creature = await loadMonsterFromFile(monster.file)
      if (creature) {
        onSelect(creature, monster.name, monster)
        onOpenChange(false)
        setSearchQuery('')
        setSelectedRole('all')
        setSelectedCRRange(0)
        setSelectedType('all')
        setSelectedKeywords([])
      }
    } catch (error) {
      console.error('Error loading monster:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const popularKeywords = useMemo(() => {
    const keywordCounts: Record<string, number> = {}
    monsters.forEach((m) => {
      m.theme_keywords.forEach((kw) => {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1
      })
    })
    return Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([kw]) => kw)
  }, [monsters])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center">
            Select Creature
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                className="pl-10 bg-secondary/50 border-border"
              />
            </div>
            {(searchQuery || selectedRole !== 'all' || selectedCRRange !== 0 || selectedType !== 'all' || selectedKeywords.length > 0) && (
              <Button variant="secondary" onClick={clearFilters} className="gap-2">
                <X className="w-4 h-4" />
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Combat Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMBAT_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === 'all' ? 'All Roles' : role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Challenge Rating</label>
              <Select value={selectedCRRange.toString()} onValueChange={(v) => setSelectedCRRange(parseInt(v))}>
                <SelectTrigger className="bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CR_RANGES.map((range, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Creature Type</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="bg-secondary/50 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATURE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-2">
            {!isLoadingList && (
              <>
                <div className="text-xs text-muted-foreground">Popular tags:</div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {popularKeywords.map((kw) => {
                    const isSelected = selectedKeywords.includes(kw)
                    return (
                      <Badge
                        key={kw}
                        variant="outline"
                        className={`cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[oklch(0.70_0.15_40)] text-[oklch(0.70_0.15_40)]'
                            : 'border-[oklch(0.35_0.08_300)] text-muted-foreground hover:border-[oklch(0.45_0.10_300)]'
                        }`}
                        onClick={() => toggleKeyword(kw)}
                      >
                        {kw}
                      </Badge>
                    )
                  })}
                </div>
              </>
            )}

            {/* FIXED HEIGHT SCROLLABLE CONTAINER - NO FLEX, FIXED HEIGHT */}
            <div className="h-[400px] overflow-y-auto overflow-x-hidden border border-border rounded-md pr-2">
              {isLoadingList ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-2">
                    <Sparkle className="w-6 h-6 text-accent animate-pulse" weight="fill" />
                    <span>Loading monsters...</span>
                  </div>
                </div>
              ) : filteredMonsters.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <MagnifyingGlass className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No monsters match your filters</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 p-2">
                  {filteredMonsters.map((monster) => (
                    <div
                      key={monster.file}
                      className="p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-accent/50 transition-all cursor-pointer"
                      onClick={() => handleSelect(monster)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm">{monster.name}</h4>
                            <Badge variant="outline" className="text-xs">
                              CR {monster.cr}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {monster.combat_role}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{monster.creature_type}</p>
                          <div className="flex flex-wrap gap-1">
                            {monster.theme_keywords.slice(0, 5).map((kw) => (
                              <Badge key={kw} variant="outline" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                            {monster.theme_keywords.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{monster.theme_keywords.length - 5}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <Sparkle className="w-6 h-6 text-accent animate-pulse" weight="fill" />
              <span>Loading monster...</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
