export type Stage = 
  | 'overview'
  | 'structure'
  | 'locations'
  | 'encounters'
  | 'npcs'
  | 'rewards'
  | 'stat-builder'
  | 'gm-mode'

export interface Adventure {
  id: string
  name: string
  stage: Stage
  overview: AdventureOverview
  conflict: ConflictData
  structure: StructureData
  locations: Location[]
  npcs: NPC[]
  rewards: Reward[]
  customStatBlocks: CustomStatBlock[]
  createdAt: number
  updatedAt: number
  selectedEncounterId?: string | null
}

export interface AdventureOverview {
  pitch: string
  themes: string[]
  gmNotes: string
  partyLevelAverage: number
  playerCount: number
  coreConflict: string
  antagonistIds: string[]
  antagonistGoals: string
}

export interface ConflictData {
  villain: Villain | null
  conflictDescription: string
  factions: Faction[]
  relationships: FactionRelationship[]
}

export interface Villain {
  id: string
  name: string
  goal: string
  methods: string
  weakness: string
}

export interface Faction {
  id: string
  name: string
  description: string
  influence: number
  goals: string[]
}

export interface FactionRelationship {
  from: string
  to: string
  type: 'allied' | 'opposed' | 'neutral' | 'complex'
  description: string
}

export interface StructureData {
  encounters: Encounter[]
  connections: EncounterConnection[]
}

export interface AbilityCheck {
  id: string
  ability: string
  skill?: string
  dc: number
  description: string
}

export type EncounterType = 
  | 'tactical'      // Was 'combat'
  | 'social'
  | 'action-sequence'  // Was 'skill-challenge'
  | 'discovery'     // Was 'investigation'
  | 'cinematic'     // New!

export type ActionSequenceType = 'chase' | 'infiltration' | 'journey' | 'survival'
export type DiscoveryType = 'area-exploration' | 'investigation' | 'puzzle' | 'research'

export interface EncounterAction {
  id: string
  type: 'skill-check' | 'other'
  // For skill checks
  ability?: string
  skill?: string
  dc?: number
  description: string
}

export interface PointOfInterest {
  id: string
  name: string
  description: string
}

export interface Encounter {
  id: string
  title: string
  description: string
  location?: string
  type: EncounterType
  durationMinutes?: number
  linkedFactions: string[]
  linkedLocations: string[]
  position: { x: number; y: number }
  rewardIds: string[]
  
  // Tactical Encounter (combat) fields
  difficulty?: number
  creatures?: string[]
  npcs?: string[]
  stakes?: string
  consequences?: string
  storyXP?: number
  
  // Action Sequence fields
  actionSequenceType?: ActionSequenceType
  rules?: string
  actions?: EncounterAction[]
  actionConsequences?: string  // Success/failure outcomes
  
  // Discovery fields
  discoveryType?: DiscoveryType
  pointsOfInterest?: PointOfInterest[]
  
  // Legacy field (for backwards compatibility)
  importantChecks?: AbilityCheck[]
}

export interface EncounterConnection {
  from: string
  to: string
  fromSide?: 'left' | 'right'
  toSide?: 'left' | 'right'
  condition?: string
}

export interface Location {
  id: string
  name: string
  type: string
  description: string
  scenes: Scene[]
}

export interface Scene {
  id: string
  name: string
  sensoryDetails: {
    sight: string
    sound: string
    smell: string
    other: string
  }
  encounters: string[]
}

export interface NPC {
  id: string
  name: string
  role: string
  appearance: string
  personality: string
  secrets: string[]
  stats?: string
  relationships: NPCRelationship[]
  portraitUrl?: string
  creature?: Creature
}

export interface NPCRelationship {
  targetId: string
  description: string
}

export interface Creature {
  size: string
  type: string
  alignment: string
  ac: number
  hp: string
  speed: string
  abilityScores: {
    str: number
    dex: number
    con: number
    int: number
    wis: number
    cha: number
  }
  skills?: string
  resistances?: string
  immunities?: string
  gear?: string
  senses?: string
  languages?: string
  cr: string
  traits?: CreatureAbility[]
  actions?: CreatureAbility[]
  bonusActions?: CreatureAbility[]
  reactions?: CreatureAbility[]
  legendaryActions?: CreatureAbility[]
}

export interface CreatureAbility {
  name: string
  description: string
}

export interface Reward {
  id: string
  name: string
  type: 'magic-item' | 'treasure' | 'social' | 'faction'
  rarity: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary'
  description: string
  encounterId?: string
}

export interface CustomStatBlock {
  id: string
  name: string
  creature: Creature
  sourceCreatureName?: string
  createdAt: number
  updatedAt: number
}
