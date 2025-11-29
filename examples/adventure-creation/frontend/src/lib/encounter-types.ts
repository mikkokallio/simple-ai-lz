import { 
  Users, 
  MagnifyingGlass, 
  Sword, 
  Target, 
  Question,
  PersonSimpleRun,
  Sparkles,
  FilmStrip
} from '@phosphor-icons/react'
import { EncounterType, ActionSequenceType, DiscoveryType } from '@/types/adventure'

export interface EncounterTypeInfo {
  type: EncounterType
  label: string
  description: string
  useCases: string[]
  icon: typeof Users
  color: string
}

export const ENCOUNTER_TYPES: EncounterTypeInfo[] = [
  {
    type: 'tactical',
    label: 'Tactical',
    icon: Sword,
    color: 'text-red-400',
    description: 'Combat encounters with creatures and tactics',
    useCases: [
      'Boss fights',
      'Ambushes',
      'Defending positions',
      'Dungeon crawls',
      'Arena battles'
    ]
  },
  {
    type: 'social',
    label: 'Social',
    icon: Users,
    color: 'text-purple-400',
    description: 'Social interactions, negotiations, and diplomacy',
    useCases: [
      'Negotiations',
      'Gathering information',
      'Building relationships',
      'Court intrigue',
      'Persuading guards'
    ]
  },
  {
    type: 'action-sequence',
    label: 'Action Sequence',
    icon: PersonSimpleRun,
    color: 'text-green-400',
    description: 'Chases, infiltrations, journeys, and skill challenges',
    useCases: [
      'Chase scenes',
      'Stealth infiltration',
      'Wilderness travel',
      'Complex skill challenges',
      'Time-sensitive escapes'
    ]
  },
  {
    type: 'discovery',
    label: 'Discovery Scene',
    icon: MagnifyingGlass,
    color: 'text-blue-400',
    description: 'Exploration, investigation, puzzles, and research',
    useCases: [
      'Area exploration',
      'Crime scene investigation',
      'Solving puzzles',
      'Library research',
      'Uncovering secrets'
    ]
  },
  {
    type: 'cinematic',
    label: 'Cinematic Scene',
    icon: FilmStrip,
    color: 'text-yellow-400',
    description: 'Story moments, cutscenes, and dramatic reveals',
    useCases: [
      'Opening scenes',
      'Dramatic reveals',
      'Story transitions',
      'NPC introductions',
      'Climactic moments'
    ]
  }
]

export const ACTION_SEQUENCE_TYPES: { value: ActionSequenceType; label: string }[] = [
  { value: 'chase', label: 'Chase' },
  { value: 'contest', label: 'Contest' },
  { value: 'escape', label: 'Escape' },
  { value: 'infiltration', label: 'Infiltration' },
  { value: 'journey', label: 'Journey' },
  { value: 'survival', label: 'Survival' },
]

export const DISCOVERY_TYPES: { value: DiscoveryType; label: string }[] = [
  { value: 'area-exploration', label: 'Area Exploration' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'research', label: 'Research' },
]

export function getEncounterTypeInfo(type: EncounterType): EncounterTypeInfo | undefined {
  return ENCOUNTER_TYPES.find(t => t.type === type)
}

export function getEncounterTypeLabel(type: EncounterType): string {
  return getEncounterTypeInfo(type)?.label || type
}

export function getActionSequenceTypeLabel(type: ActionSequenceType): string {
  return ACTION_SEQUENCE_TYPES.find(t => t.value === type)?.label || type
}

export function getDiscoveryTypeLabel(type: DiscoveryType): string {
  return DISCOVERY_TYPES.find(t => t.value === type)?.label || type
}

// Map old encounter types to new ones for backwards compatibility
export function migrateEncounterType(oldType: string): EncounterType {
  const typeMap: Record<string, EncounterType> = {
    'combat': 'tactical',
    'skill-challenge': 'action-sequence',
    'chase': 'action-sequence',
    'investigation': 'discovery',
    'puzzle': 'discovery',
    'hazard': 'tactical',
    'survival': 'action-sequence',
    'social': 'social',
  }
  return (typeMap[oldType] as EncounterType) || 'tactical'
}

export function formatEncounterTypesForAI(): string {
  const validTypes = ENCOUNTER_TYPES.map(t => t.label).join(', ')
  const typeDetails = ENCOUNTER_TYPES.map(t => 
    `- **${t.label}** (type: "${t.type}"): ${t.description}`
  ).join('\n')
  
  return `VALID ENCOUNTER TYPES - USE THESE EXACT TYPES:
${validTypes}

When creating encounters, use these EXACT type values:
${typeDetails}

⚠️ CRITICAL RULES:
1. ONLY use these 5 encounter types: ${ENCOUNTER_TYPES.map(t => t.type).join(', ')}
2. Use the internal type value (e.g., "tactical" not "Tactical Encounter")
3. NEVER use old types: "combat", "skill-challenge", "investigation", "puzzle", "hazard", "chase", "survival"
4. The "type" field MUST be one of: ${ENCOUNTER_TYPES.map(t => t.type).join(', ')}`
}

