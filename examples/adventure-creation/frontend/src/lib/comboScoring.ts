// Combo scoring system for encounter generation

import { parseCR, isDangerousCreature, isCR0Creature, MonsterMetadata } from './monsterFiltering'

export interface CreatureInCombo {
  monster: MonsterMetadata
  count: number
}

export interface ComboSuggestion {
  creatures: CreatureInCombo[]
  totalXP: number
  percentOfBudget: number
  mixProfile: string // "solo" | "duo" | "balanced" | "elite-with-minions" | "small-group"
  statBlockCount: number
  totalCreatureCount: number
  creatureToPlayerRatio: number
  warnings: string[]
  score: number
}

export interface ComboConstraints {
  budget: number
  partyLevel: number
  partySize: number
  targetXPMin: number // 95% of budget
  targetXPMax: number // 105% of budget
}

/**
 * Score a combo based on DMG guidelines and best practices
 * Higher score = better encounter
 */
export function scoreCombo(
  combo: ComboSuggestion,
  constraints: ComboConstraints
): number {
  let score = 0

  // 1. Budget accuracy (35 points)
  // Closer to 100% is better
  const budgetAccuracy = 100 - Math.abs(100 - combo.percentOfBudget)
  score += (budgetAccuracy / 100) * 35

  // 2. Creature count preference (30 points)
  // BIAS TOWARD FEWER CREATURES - this is the key change
  // Optimal: 1-4 creatures (full points)
  // Acceptable: 5-6 creatures (reduced points)
  // Discouraged: 7+ creatures (minimal points)
  const totalCreatures = combo.totalCreatureCount
  if (totalCreatures === 1) {
    score += 25 // Solo is rare but acceptable
  } else if (totalCreatures >= 2 && totalCreatures <= 4) {
    score += 30 // OPTIMAL range
  } else if (totalCreatures === 5) {
    score += 20
  } else if (totalCreatures === 6) {
    score += 15
  } else if (totalCreatures <= 8) {
    score += 10
  } else {
    score += 5 // Heavy penalty for hordes
  }

  // 3. Stat block simplicity (20 points)
  // Fewer stat blocks = easier to run
  if (combo.statBlockCount === 1) {
    score += 20
  } else if (combo.statBlockCount === 2) {
    score += 18
  } else if (combo.statBlockCount === 3) {
    score += 12
  } else if (combo.statBlockCount === 4) {
    score += 5
  }
  // 5+ stat blocks get 0 points

  // 4. Creature-to-PC ratio (10 points)
  // Prefer ratio ≤ 1.5, acceptable up to 2.0
  const ratio = combo.creatureToPlayerRatio
  if (ratio <= 1.0) {
    score += 10
  } else if (ratio <= 1.5) {
    score += 8
  } else if (ratio <= 2.0) {
    score += 5
  } else if (ratio <= 2.5) {
    score += 2
  }
  // Higher ratios get 0 points

  // 5. Special penalty for low-level parties with too many creatures (-20 points)
  if (constraints.partyLevel <= 2 && ratio > 2.0) {
    score -= 20
  }

  // 6. Role diversity bonus (5 points)
  const uniqueRoles = new Set(combo.creatures.map(c => c.monster.combat_role)).size
  if (uniqueRoles >= 3) {
    score += 5
  } else if (uniqueRoles >= 2) {
    score += 3
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Generate warnings for a combo based on DMG guidelines
 */
export function generateComboWarnings(
  combo: ComboSuggestion,
  constraints: ComboConstraints
): string[] {
  const warnings: string[] = []

  // Check for dangerous creatures (CR > party level)
  const dangerousCreatures = combo.creatures.filter(c =>
    isDangerousCreature(c.monster, constraints.partyLevel)
  )
  if (dangerousCreatures.length > 0) {
    const names = dangerousCreatures.map(c => c.monster.name).join(', ')
    warnings.push(`${names} may deal massive damage - can one-shot characters`)
  }

  // Check for too many creatures
  if (combo.creatureToPlayerRatio > 2.5) {
    warnings.push(`High creature count (${combo.totalCreatureCount}) - combat may be slow`)
  }

  // Check for low-level party with many creatures
  if (constraints.partyLevel <= 2 && combo.creatureToPlayerRatio > 2.0) {
    warnings.push(`Too many creatures for level ${constraints.partyLevel} party - very dangerous`)
  }

  // Check for many stat blocks
  if (combo.statBlockCount > 3) {
    warnings.push(`${combo.statBlockCount} different stat blocks - complex to run`)
  }

  // Check for many CR 0 creatures
  const cr0Count = combo.creatures
    .filter(c => isCR0Creature(c.monster))
    .reduce((sum, c) => sum + c.count, 0)
  if (cr0Count > 3) {
    warnings.push(`${cr0Count} CR 0 creatures - consider using swarms instead`)
  }

  // Check for solo encounters
  if (combo.totalCreatureCount === 1) {
    warnings.push('Solo encounter - may end quickly, consider legendary actions')
  }

  return warnings
}

/**
 * Classify combo by its composition profile
 */
export function classifyComboProfile(combo: ComboSuggestion): string {
  const total = combo.totalCreatureCount
  const statBlocks = combo.statBlockCount

  if (total === 1) {
    return 'solo'
  }

  if (total === 2 && statBlocks === 2) {
    return 'duo'
  }

  if (total >= 2 && total <= 4 && statBlocks <= 2) {
    return 'balanced'
  }

  // Check for elite + minions pattern
  const sorted = [...combo.creatures].sort((a, b) => {
    const crA = parseCR(a.monster.cr)
    const crB = parseCR(b.monster.cr)
    return crB - crA
  })

  if (sorted.length >= 2) {
    const strongestCR = parseCR(sorted[0].monster.cr)
    const weakestCR = parseCR(sorted[sorted.length - 1].monster.cr)
    
    if (strongestCR - weakestCR >= 2 && sorted[0].count <= 2) {
      return 'elite-with-minions'
    }
  }

  return 'small-group'
}
