// Monster filtering utilities for encounter building

import { crToXP } from './encounterCalculator'

export interface MonsterMetadata {
  name: string
  file: string
  cr: string
  summary: string
  combat_role: string
  theme_keywords: string[]
  creature_type: string
}

export interface FilterOptions {
  budget: number
  partyLevel: number
  partySize: number
  encounterType?: string
  themeKeywords?: string[]
}

/**
 * Parse CR string to numeric value for comparison
 */
export function parseCR(cr: string): number {
  if (cr === '0') return 0
  if (cr === '1/8') return 0.125
  if (cr === '1/4') return 0.25
  if (cr === '1/2') return 0.5
  return parseFloat(cr)
}

/**
 * Filter monsters by CR range relative to party level
 * Wide range to allow thematic choices: CR 0 to (partyLevel + 4)
 * Low CR creatures can be paired with bosses for interesting dynamics
 * Scoring system biases toward fewer total creatures
 */
export function filterByCRRange(
  monsters: MonsterMetadata[],
  partyLevel: number
): MonsterMetadata[] {
  const minCR = 0 // Allow any CR from 0 up
  const maxCR = partyLevel + 4

  return monsters.filter(monster => {
    const cr = parseCR(monster.cr)
    return cr >= minCR && cr <= maxCR
  })
}

/**
 * Filter monsters by budget constraint
 * Remove any monster whose individual XP exceeds the total budget
 */
export function filterByBudget(
  monsters: MonsterMetadata[],
  budget: number
): MonsterMetadata[] {
  return monsters.filter(monster => {
    const monsterXP = crToXP(monster.cr)
    return monsterXP <= budget
  })
}

/**
 * Filter monsters by theme relevance
 * Matches encounter type and theme keywords
 */
export function filterByTheme(
  monsters: MonsterMetadata[],
  encounterType?: string,
  themeKeywords?: string[]
): MonsterMetadata[] {
  if (!encounterType && (!themeKeywords || themeKeywords.length === 0)) {
    return monsters
  }

  return monsters.filter(monster => {
    let score = 0

    // Match encounter type to creature capabilities
    if (encounterType === 'combat' || encounterType === 'chase') {
      score += 1 // All creatures can be used in combat
    }

    // Match theme keywords
    if (themeKeywords && themeKeywords.length > 0) {
      const matchingKeywords = monster.theme_keywords.filter(keyword =>
        themeKeywords.includes(keyword)
      )
      score += matchingKeywords.length
    }

    return score > 0 || (!themeKeywords || themeKeywords.length === 0)
  })
}

/**
 * Check if a monster is dangerous for the party
 * Returns true if CR > party level (can potentially one-shot characters)
 */
export function isDangerousCreature(
  monster: MonsterMetadata,
  partyLevel: number
): boolean {
  return parseCR(monster.cr) > partyLevel
}

/**
 * Check if a creature is CR 0 (needs special handling)
 */
export function isCR0Creature(monster: MonsterMetadata): boolean {
  return monster.cr === '0'
}

/**
 * Check if a creature is fragile (good for hordes)
 * Fragile = striker or skirmisher role (typically lower HP)
 */
export function isFragileCreature(monster: MonsterMetadata): boolean {
  return ['striker', 'skirmisher', 'artillery'].includes(monster.combat_role)
}

/**
 * Main filtering function - applies all filters
 */
export function filterMonsters(
  monsters: MonsterMetadata[],
  options: FilterOptions
): MonsterMetadata[] {
  let filtered = monsters

  // Apply CR range filter
  filtered = filterByCRRange(filtered, options.partyLevel)

  // Apply budget filter
  filtered = filterByBudget(filtered, options.budget)

  // Apply theme filter (optional, doesn't exclude if no themes provided)
  if (options.encounterType || options.themeKeywords) {
    filtered = filterByTheme(filtered, options.encounterType, options.themeKeywords)
  }

  return filtered
}

/**
 * Get monsters suitable for minion roles (lower CR, fragile)
 */
export function getMinionCandidates(
  monsters: MonsterMetadata[],
  partyLevel: number
): MonsterMetadata[] {
  return monsters.filter(monster => {
    const cr = parseCR(monster.cr)
    return cr < partyLevel && isFragileCreature(monster)
  })
}

/**
 * Get monsters suitable for boss roles (higher CR)
 */
export function getBossCandidates(
  monsters: MonsterMetadata[],
  partyLevel: number
): MonsterMetadata[] {
  return monsters.filter(monster => {
    const cr = parseCR(monster.cr)
    return cr >= partyLevel && cr <= partyLevel + 4
  })
}
