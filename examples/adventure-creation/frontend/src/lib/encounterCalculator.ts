// D&D 2024 Combat Encounter Difficulty Calculator

export type EncounterDifficulty = 'low' | 'moderate' | 'high'

// XP Budget per Character based on D&D 2024 rules
const XP_BUDGET_TABLE: Record<number, Record<EncounterDifficulty, number>> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 5500, moderate: 10700, high: 17200 },
  20: { low: 6400, moderate: 13200, high: 22000 }
}

/**
 * Calculate the XP budget for an encounter
 * @param partyLevel The average level of the party
 * @param partySize Number of characters in the party
 * @param difficulty The desired encounter difficulty
 * @returns Total XP budget for the encounter
 */
export function calculateXPBudget(
  partyLevel: number,
  partySize: number,
  difficulty: EncounterDifficulty
): number {
  const level = Math.max(1, Math.min(20, Math.round(partyLevel)))
  const xpPerCharacter = XP_BUDGET_TABLE[level][difficulty]
  return xpPerCharacter * partySize
}

/**
 * Parse CR value to XP
 * CR values can be fractions like "1/8", "1/4", "1/2" or numbers like "1", "2"
 */
export function crToXP(cr: string): number {
  const crToXPMap: Record<string, number> = {
    '0': 0,
    '1/8': 25,
    '1/4': 50,
    '1/2': 100,
    '1': 200,
    '2': 450,
    '3': 700,
    '4': 1100,
    '5': 1800,
    '6': 2300,
    '7': 2900,
    '8': 3900,
    '9': 5000,
    '10': 5900,
    '11': 7200,
    '12': 8400,
    '13': 10000,
    '14': 11500,
    '15': 13000,
    '16': 15000,
    '17': 18000,
    '18': 20000,
    '19': 22000,
    '20': 25000,
    '21': 33000,
    '22': 41000,
    '23': 50000,
    '24': 62000,
    '25': 75000,
    '26': 90000,
    '27': 105000,
    '28': 120000,
    '29': 135000,
    '30': 155000
  }
  
  return crToXPMap[cr] || 0
}

/**
 * Calculate the total XP value of creatures in an encounter
 */
export function calculateTotalXP(creatureCRs: string[]): number {
  return creatureCRs.reduce((total, cr) => total + crToXP(cr), 0)
}

/**
 * Get encounter difficulty description
 */
export function getDifficultyDescription(difficulty: EncounterDifficulty): string {
  const descriptions: Record<EncounterDifficulty, string> = {
    low: 'An encounter of low difficulty is likely to have one or two scary moments for the players, but their characters should emerge victorious with no casualties.',
    moderate: 'Absent healing and other resources, an encounter of moderate difficulty could go badly for the adventurers. Weaker characters might get taken out of the fight.',
    high: 'A high-difficulty encounter could be lethal for one or more characters. To survive it, the characters will need smart tactics, quick thinking, and maybe even a little luck.'
  }
  return descriptions[difficulty]
}

/**
 * Calculate encounter statistics
 */
export interface EncounterStats {
  budget: number
  spent: number
  remaining: number
  percentUsed: number
  isOverBudget: boolean
}

export function calculateEncounterStats(
  partyLevel: number,
  partySize: number,
  difficulty: EncounterDifficulty,
  creatureCRs: string[]
): EncounterStats {
  const budget = calculateXPBudget(partyLevel, partySize, difficulty)
  const spent = calculateTotalXP(creatureCRs)
  const remaining = budget - spent
  const percentUsed = budget > 0 ? (spent / budget) * 100 : 0
  const isOverBudget = spent > budget
  
  return {
    budget,
    spent,
    remaining,
    percentUsed,
    isOverBudget
  }
}
