/**
 * Regenerate monster metadata using LLM semantic analysis
 * This processes monsters in batches to avoid API overload
 */

import { MonsterMetadata } from './monsterParser'

const THEME_KEYWORDS = [
  // Setting/Environment
  "urban", "wilderness", "dungeon", "underdark", "underwater", "aerial", "desert", 
  "arctic", "forest", "swamp", "mountain", "plains", "coastal", "volcanic", "cave",
  
  // Creature Types & Origins
  "undead", "fiend", "celestial", "elemental", "fey", "aberration", "construct", 
  "dragon", "giant", "humanoid", "beast", "monstrosity", "ooze", "plant",
  
  // Campaign Themes
  "gothic-horror", "cosmic-horror", "high-fantasy", "dark-fantasy", "sword-and-sorcery",
  "planar", "extraplanar", "infernal", "abyssal", "feywild", "shadowfell",
  
  // Social/Faction
  "criminal", "military", "religious", "nobility", "peasant", "merchant", "pirate",
  "bandit", "cultist", "guard", "soldier", "assassin", "spy", "thief",
  
  // Magic & Supernatural
  "spellcaster", "magical", "arcane", "divine", "primal", "psionic", "cursed",
  "enchanted", "shapeshifter", "illusionist", "necromancer", "summoner",
  
  // Combat Style
  "melee", "ranged", "ambush", "stealthy", "brute", "tactical", "swarm",
  "mounted", "siege", "grappler", "poisonous", "venomous",
  
  // Moral Alignment Themes
  "evil", "good", "chaotic", "lawful", "neutral", "demonic", "diabolic", "holy",
  
  // Special Abilities
  "flying", "swimming", "burrowing", "climbing", "invisible", "intangible",
  "regenerating", "shapeshifting", "teleporting", "charming", "frightening",
  
  // Difficulty & Encounter Type
  "minion", "elite", "boss", "legendary", "mythic", "solo",
  
  // Specific Genres/Scenarios
  "investigation", "intrigue", "exploration", "combat-heavy", "social",
  "mystery", "heist", "war", "plague", "apocalypse"
]

interface MonsterData {
  name: string
  file: string
  cr: string
  creature_type: string
  summary: string
}

export interface RegenerationProgress {
  total: number
  processed: number
  current: string
  failed: number
  status: 'running' | 'paused' | 'complete' | 'error'
}

async function extractMonsterInfo(html: string): Promise<MonsterData | null> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  // Extract name
  const nameLink = doc.querySelector('.mon-stat-block-2024__name-link')
  const name = nameLink?.textContent?.trim()
  if (!name) return null
  
  // Extract CR
  const crLabel = Array.from(doc.querySelectorAll('.mon-stat-block-2024__tidbit-label'))
    .find(el => el.textContent === 'CR')
  const crData = crLabel?.nextElementSibling?.textContent?.trim()
  const crMatch = crData?.match(/^(\d+(?:\/\d+)?)/)
  const cr = crMatch ? crMatch[1] : '0'
  
  // Extract creature type
  const meta = doc.querySelector('.mon-stat-block-2024__meta')
  const creature_type = meta?.textContent?.trim() || ''
  
  // Extract description (first paragraph)
  const descBlock = doc.querySelector('.mon-details__description-block-content')
  const firstPara = descBlock?.querySelector('p')
  const description = firstPara?.textContent?.trim() || ''
  
  // Extract abilities
  const abilityBlocks = Array.from(doc.querySelectorAll('.mon-stat-block-2024__description-block'))
  const abilities = abilityBlocks.map(block => {
    const heading = block.querySelector('.mon-stat-block-2024__description-block-heading')
    const content = block.querySelector('.mon-stat-block-2024__description-block-content')
    if (heading && content) {
      return `${heading.textContent?.trim()}: ${content.textContent?.trim().substring(0, 200)}`
    }
    return ''
  }).filter(Boolean)
  
  // Generate summary
  let summary = description
  if (summary) {
    const sentences = summary.split(/[.!?]/)
    summary = sentences[0]?.trim() || summary.substring(0, 100)
    if (summary.length > 120) {
      summary = summary.substring(0, 117) + '...'
    }
  } else {
    summary = `A ${creature_type.toLowerCase()} of CR ${cr}`
  }
  
  return {
    name,
    file: '',
    cr,
    creature_type,
    summary
  }
}

async function generateKeywordsForMonster(
  monsterData: MonsterData,
  abilities: string[]
): Promise<string[]> {
  const abilitiesText = abilities.join('\n')
  
  const prompt = `You are analyzing a D&D 5e monster to assign theme keywords for encounter filtering.

MONSTER: ${monsterData.name}
TYPE: ${monsterData.creature_type}
DESCRIPTION: ${monsterData.summary}

ABILITIES:
${abilitiesText || 'No abilities listed'}

AVAILABLE KEYWORDS (choose UP TO 5 that best fit):
${THEME_KEYWORDS.join(', ')}

INSTRUCTIONS:
- Choose 3-5 keywords that BEST describe this monster's themes
- Use semantic understanding: "avoids cities" should NOT get 'urban', but "city guard" should
- "rarely in water" should NOT get 'underwater', but "aquatic hunter" should
- Prioritize the most distinctive and useful keywords for encounter filtering
- Include creature type, environment WHERE APPROPRIATE, and thematic elements

Return ONLY a JSON object with this structure:
{"keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]}

Use at most 5 keywords, at least 2. Be selective and semantic.`

  try {
    const response = await (window as any).spark.llm(prompt, 'gpt-4o-mini', true)
    
    // Parse JSON response
    let jsonText = response.trim()
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0].trim()
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0].trim()
    }
    
    const result = JSON.parse(jsonText)
    const keywords = result.keywords || []
    
    // Validate keywords are from approved list
    const validKeywords = keywords.filter((kw: string) => THEME_KEYWORDS.includes(kw))
    
    return validKeywords.slice(0, 5)
  } catch (error) {
    console.error(`Failed to generate keywords for ${monsterData.name}:`, error)
    // Fallback: extract basic keywords from creature type
    return extractBasicKeywords(monsterData)
  }
}

function extractBasicKeywords(monsterData: MonsterData): string[] {
  const keywords: string[] = []
  const ctLower = monsterData.creature_type.toLowerCase()
  const nameLower = monsterData.name.toLowerCase()
  
  // Creature type keywords
  const typeKeywords = ['undead', 'fiend', 'elemental', 'fey', 'celestial', 'aberration', 
                        'construct', 'dragon', 'giant', 'beast', 'humanoid', 'monstrosity', 
                        'ooze', 'plant']
  for (const kw of typeKeywords) {
    if (ctLower.includes(kw)) keywords.push(kw)
  }
  
  // Alignment
  const alignmentKeywords = ['evil', 'good', 'chaotic', 'lawful']
  for (const kw of alignmentKeywords) {
    if (ctLower.includes(kw)) keywords.push(kw)
  }
  
  // Name-based
  if (nameLower.includes('cultist')) keywords.push('cultist')
  if (nameLower.includes('pirate')) keywords.push('pirate')
  if (nameLower.includes('guard') || nameLower.includes('soldier')) keywords.push('military')
  
  return keywords.slice(0, 5)
}

export async function regenerateMonsterMetadata(
  onProgress: (progress: RegenerationProgress) => void,
  batchSize: number = 10
): Promise<void> {
  try {
    // Load current metadata
    const response = await fetch('/monsters-metadata.json')
    const metadata = await response.json()
    const monsters = metadata.monsters as MonsterMetadata[]
    
    console.log(`Starting regeneration for ${monsters.length} monsters...`)
    
    let processed = 0
    let failed = 0
    const updatedMonsters: MonsterMetadata[] = []
    
    // Process in batches
    for (let i = 0; i < monsters.length; i += batchSize) {
      const batch = monsters.slice(i, i + batchSize)
      
      for (const monster of batch) {
        onProgress({
          total: monsters.length,
          processed,
          current: monster.name,
          failed,
          status: 'running'
        })
        
        try {
          // Load monster HTML
          const htmlResponse = await fetch(`/monsters/${monster.file}`)
          const html = await htmlResponse.text()
          
          // Extract info
          const parser = new DOMParser()
          const doc = parser.parseFromString(html, 'text/html')
          
          const abilityBlocks = Array.from(doc.querySelectorAll('.mon-stat-block-2024__description-block'))
          const abilities = abilityBlocks.map(block => {
            const heading = block.querySelector('.mon-stat-block-2024__description-block-heading')
            const content = block.querySelector('.mon-stat-block-2024__description-block-content')
            if (heading && content) {
              return `${heading.textContent?.trim()}: ${content.textContent?.trim().substring(0, 200)}`
            }
            return ''
          }).filter(Boolean)
          
          // Generate keywords using LLM
          const keywords = await generateKeywordsForMonster(monster, abilities)
          
          updatedMonsters.push({
            ...monster,
            theme_keywords: keywords
          })
          
          console.log(`✓ ${monster.name}: [${keywords.join(', ')}]`)
        } catch (error) {
          console.error(`✗ Failed: ${monster.name}`, error)
          failed++
          // Keep original monster data
          updatedMonsters.push(monster)
        }
        
        processed++
      }
      
      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Update metadata
    const updatedMetadata = {
      ...metadata,
      version: '2.0',
      generated: new Date().toISOString().split('T')[0],
      description: 'Monster metadata for D&D 5e creatures, with LLM-generated semantic keywords',
      monsters: updatedMonsters
    }
    
    // Download as JSON file for user to save
    const blob = new Blob([JSON.stringify(updatedMetadata, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'monsters-metadata-new.json'
    a.click()
    URL.revokeObjectURL(url)
    
    onProgress({
      total: monsters.length,
      processed: monsters.length,
      current: 'Complete!',
      failed,
      status: 'complete'
    })
    
    console.log(`\n✅ Regeneration complete!`)
    console.log(`Total: ${monsters.length}, Success: ${processed - failed}, Failed: ${failed}`)
    console.log(`\nDownloaded: monsters-metadata-new.json`)
    console.log(`Replace /workspaces/spark-template/monsters-metadata.json with this file.`)
  } catch (error) {
    console.error('Regeneration failed:', error)
    onProgress({
      total: 0,
      processed: 0,
      current: `Error: ${error}`,
      failed: 0,
      status: 'error'
    })
  }
}
