// Combo generation algorithm for encounter building

import { crToXP } from './encounterCalculator'
import {
  MonsterMetadata,
  parseCR,
  getBossCandidates,
  getMinionCandidates,
  isFragileCreature,
  isDangerousCreature
} from './monsterFiltering'
import {
  ComboSuggestion,
  ComboConstraints,
  CreatureInCombo,
  scoreCombo,
  generateComboWarnings,
  classifyComboProfile
} from './comboScoring'

// Re-export types for convenience
export type { ComboSuggestion, ComboConstraints, CreatureInCombo }

/**
 * Generate multiple valid creature combinations within budget
 */
export function generateCombos(
  filteredMonsters: MonsterMetadata[],
  constraints: ComboConstraints
): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []

  // Strategy 1: Solo Boss
  combos.push(...generateSoloBossCombos(filteredMonsters, constraints))

  // Strategy 2: Duo Encounters (2-3 creatures, 2 types)
  combos.push(...generateDuoCombos(filteredMonsters, constraints))

  // Strategy 3: Balanced Small Groups (2-4 creatures)
  combos.push(...generateBalancedGroupCombos(filteredMonsters, constraints))

  // Strategy 4: Elite + Minions
  combos.push(...generateEliteWithMinionsCombos(filteredMonsters, constraints))

  // Strategy 5: Small Groups of Same Type (2-4 identical creatures)
  combos.push(...generateHomogeneousCombos(filteredMonsters, constraints))

  // Score all combos
  const scoredCombos = combos.map(combo => {
    const score = scoreCombo(combo, constraints)
    const warnings = generateComboWarnings(combo, constraints)
    const profile = classifyComboProfile(combo)
    
    return {
      ...combo,
      score,
      warnings,
      mixProfile: profile
    }
  })

  // Sort by score (best first) and return top candidates
  const sortedCombos = scoredCombos.sort((a, b) => b.score - a.score)
  
  // Deduplicate by CR pattern to ensure variety
  const seenPatterns = new Set<string>()
  const diverseCombos: ComboSuggestion[] = []
  const maxPerPattern = 2 // Allow max 2 combos with same CR pattern
  const patternCounts = new Map<string, number>()
  
  for (const combo of sortedCombos) {
    // Create a CR pattern signature (e.g., "1xCR9" or "2xCR5,1xCR6")
    const pattern = combo.creatures
      .map(c => `${c.count}xCR${c.monster.cr}`)
      .sort()
      .join(',')
    
    const count = patternCounts.get(pattern) || 0
    if (count < maxPerPattern) {
      diverseCombos.push(combo)
      patternCounts.set(pattern, count + 1)
    }
    
    if (diverseCombos.length >= 20) break
  }
  
  console.log(`Generated ${combos.length} raw combos, deduped to ${diverseCombos.length} with variety`)
  console.log(`Unique CR patterns: ${patternCounts.size}`)
  
  return diverseCombos
}

/**
 * Generate solo boss encounter combos
 */
function generateSoloBossCombos(
  monsters: MonsterMetadata[],
  constraints: ComboConstraints
): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []
  const bosses = getBossCandidates(monsters, constraints.partyLevel)

  for (const boss of bosses) {
    const xp = crToXP(boss.cr)
    
    if (xp >= constraints.targetXPMin && xp <= constraints.targetXPMax) {
      combos.push(createCombo([{ monster: boss, count: 1 }], constraints))
    }
  }

  return combos
}

/**
 * Generate duo encounter combos (2 different creature types)
 */
function generateDuoCombos(
  monsters: MonsterMetadata[],
  constraints: ComboConstraints
): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []
  const maxCreatures = Math.ceil(constraints.partySize * 1.5)

  // Try combinations of 2 different creatures
  for (let i = 0; i < Math.min(monsters.length, 50); i++) {
    for (let j = i + 1; j < Math.min(monsters.length, 50); j++) {
      const m1 = monsters[i]
      const m2 = monsters[j]

      // Try different count combinations - more variations
      const countCombos = [
        [1, 1], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1],
        [2, 3], [3, 2], [1, 4], [4, 1]
      ]

      for (const [count1, count2] of countCombos) {
        const total = count1 + count2
        if (total > maxCreatures || total > 4) continue // Bias toward fewer

        const xp = crToXP(m1.cr) * count1 + crToXP(m2.cr) * count2
        
        if (xp >= constraints.targetXPMin && xp <= constraints.targetXPMax) {
          combos.push(createCombo([
            { monster: m1, count: count1 },
            { monster: m2, count: count2 }
          ], constraints))
        }
      }
    }
  }

  return combos
}

/**
 * Generate balanced group combos (2-4 creatures of 2-3 types)
 */
function generateBalancedGroupCombos(
  monsters: MonsterMetadata[],
  constraints: ComboConstraints
): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []
  const maxCreatures = Math.ceil(constraints.partySize * 1.5)

  // Try combinations of 3 different creatures
  for (let i = 0; i < Math.min(monsters.length, 30); i++) {
    for (let j = i + 1; j < Math.min(monsters.length, 30); j++) {
      for (let k = j + 1; k < Math.min(monsters.length, 30); k++) {
        const m1 = monsters[i]
        const m2 = monsters[j]
        const m3 = monsters[k]

        // Try different count combinations (bias toward lower counts)
        const countCombos = [
          [1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2],
          [2, 2, 1], [2, 1, 2], [1, 2, 2]
        ]

        for (const [count1, count2, count3] of countCombos) {
          const total = count1 + count2 + count3
          if (total > maxCreatures || total > 4) continue

          const xp = crToXP(m1.cr) * count1 + crToXP(m2.cr) * count2 + crToXP(m3.cr) * count3
          
          if (xp >= constraints.targetXPMin && xp <= constraints.targetXPMax) {
            combos.push(createCombo([
              { monster: m1, count: count1 },
              { monster: m2, count: count2 },
              { monster: m3, count: count3 }
            ], constraints))
          }
        }
      }
    }
  }

  return combos
}

/**
 * Generate elite + minions combos
 * Includes thematic pairings of high CR bosses with low CR support creatures
 */
function generateEliteWithMinionsCombos(
  monsters: MonsterMetadata[],
  constraints: ComboConstraints
): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []
  const bosses = getBossCandidates(monsters, constraints.partyLevel)
  
  // Get ALL low CR creatures (not just fragile ones) for thematic variety
  const lowCRCreatures = monsters.filter(m => parseCR(m.cr) < constraints.partyLevel)
  const maxCreatures = Math.ceil(constraints.partySize * 2) // Allow slightly more for minions

  for (const boss of bosses) {
    for (const minion of lowCRCreatures) {
      const bossXP = crToXP(boss.cr)
      const minionXP = crToXP(minion.cr)

      // Try 1 elite + 1-4 minions (wider range)
      for (let minionCount = 1; minionCount <= 4; minionCount++) {
        const total = 1 + minionCount
        if (total > maxCreatures) continue

        const xp = bossXP + minionXP * minionCount
        
        if (xp >= constraints.targetXPMin && xp <= constraints.targetXPMax) {
          combos.push(createCombo([
            { monster: boss, count: 1 },
            { monster: minion, count: minionCount }
          ], constraints))
        }
      }
      
      // Also try 1 elite + 2 different low CR types (e.g., boss + guards + hounds)
      for (const minion2 of lowCRCreatures) {
        if (minion2.file === minion.file) continue
        
        const minion2XP = crToXP(minion2.cr)
        const countCombos = [[1, 1], [2, 1], [1, 2]]
        
        for (const [count1, count2] of countCombos) {
          const total = 1 + count1 + count2
          if (total > 4) continue // Keep manageable
          
          const xp = bossXP + minionXP * count1 + minion2XP * count2
          
          if (xp >= constraints.targetXPMin && xp <= constraints.targetXPMax) {
            combos.push(createCombo([
              { monster: boss, count: 1 },
              { monster: minion, count: count1 },
              { monster: minion2, count: count2 }
            ], constraints))
          }
        }
      }
    }
  }

  return combos
}

/**
 * Generate combos with multiple creatures of the same type
 */
function generateHomogeneousCombos(
  monsters: MonsterMetadata[],
  constraints: ComboConstraints
): ComboSuggestion[] {
  const combos: ComboSuggestion[] = []
  const maxCreatures = Math.ceil(constraints.partySize * 1.5)

  for (const monster of monsters) {
    const xp = crToXP(monster.cr)

    // Try 2-6 of the same creature (wider range for more variety)
    for (let count = 2; count <= 6; count++) {
      if (count > maxCreatures) continue

      const totalXP = xp * count
      
      if (totalXP >= constraints.targetXPMin && totalXP <= constraints.targetXPMax) {
        combos.push(createCombo([{ monster, count }], constraints))
      }
    }
  }

  return combos

  return combos
}

/**
 * Helper to create a combo object with calculated values
 */
function createCombo(
  creatures: CreatureInCombo[],
  constraints: ComboConstraints
): ComboSuggestion {
  const totalXP = creatures.reduce((sum, c) => sum + crToXP(c.monster.cr) * c.count, 0)
  const totalCreatureCount = creatures.reduce((sum, c) => sum + c.count, 0)
  const statBlockCount = creatures.length
  const percentOfBudget = (totalXP / constraints.budget) * 100
  const creatureToPlayerRatio = totalCreatureCount / constraints.partySize

  return {
    creatures,
    totalXP,
    percentOfBudget,
    mixProfile: '', // Will be set by scoring function
    statBlockCount,
    totalCreatureCount,
    creatureToPlayerRatio,
    warnings: [],
    score: 0
  }
}

/**
 * Format combo for display
 */
export function formatComboDescription(combo: ComboSuggestion): string {
  const parts = combo.creatures.map(c => {
    const count = c.count > 1 ? `${c.count}× ` : ''
    return `${count}${c.monster.name} (CR ${c.monster.cr})`
  })
  
  return parts.join(' + ')
}

/**
 * Get detailed combo statistics for display
 */
export function getComboStats(combo: ComboSuggestion) {
  return {
    description: formatComboDescription(combo),
    totalXP: combo.totalXP,
    percentOfBudget: Math.round(combo.percentOfBudget),
    creatureCount: combo.totalCreatureCount,
    statBlocks: combo.statBlockCount,
    ratio: combo.creatureToPlayerRatio.toFixed(1),
    profile: combo.mixProfile,
    warnings: combo.warnings,
    score: Math.round(combo.score)
  }
}
