import { Creature, CreatureAbility } from '@/types/adventure'

export interface MonsterMetadata {
  name: string
  file: string
  cr: string
  summary: string
  combat_role: string
  theme_keywords: string[]
  creature_type: string
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function extractStat(doc: Document, selector: string): string {
  const element = doc.querySelector(selector)
  if (!element) return ''
  return cleanText(element.textContent || '')
}

function parseAbilityScore(doc: Document, ability: string): number {
  const rows = doc.querySelectorAll('.stat-table tbody tr')
  for (const row of rows) {
    const th = row.querySelector('th')
    if (th && th.textContent?.trim() === ability) {
      const tds = row.querySelectorAll('td')
      if (tds.length > 0) {
        return parseInt(tds[0].textContent?.trim() || '10')
      }
    }
  }
  return 10
}

function parseAbilities(doc: Document, heading: string): CreatureAbility[] {
  const abilities: CreatureAbility[] = []
  const blocks = doc.querySelectorAll('.mon-stat-block-2024__description-block')
  
  for (const block of blocks) {
    const blockHeading = block.querySelector('.mon-stat-block-2024__description-block-heading')
    if (blockHeading && blockHeading.textContent?.trim() === heading) {
      const content = block.querySelector('.mon-stat-block-2024__description-block-content')
      if (content) {
        const paragraphs = content.querySelectorAll('p')
        for (const p of paragraphs) {
          const html = p.innerHTML
          const strongMatch = html.match(/<em><strong>([^<]+)<\/strong>(?:[^<]*)<\/em>/)
          if (strongMatch) {
            const name = strongMatch[1].replace(/\.$/, '').trim()
            let description = html
              .replace(/<em><strong>[^<]+<\/strong>[^<]*<\/em>\s*/, '')
              .trim()
            
            abilities.push({ name, description })
          }
        }
      }
    }
  }
  
  return abilities
}

export async function parseMonsterHTML(htmlContent: string): Promise<Creature | null> {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlContent, 'text/html')
    
    const nameElement = doc.querySelector('.mon-stat-block-2024__name-link')
    if (!nameElement) return null
    
    const metaElement = doc.querySelector('.mon-stat-block-2024__meta')
    const meta = metaElement?.textContent?.trim() || ''
    const metaParts = meta.split(',').map(s => s.trim())
    
    let size = 'Medium'
    let type = 'Humanoid'
    let alignment = 'Unaligned'
    
    if (metaParts.length >= 2) {
      const sizeType = metaParts[0].split(' ')
      if (sizeType.length >= 2) {
        size = sizeType.slice(0, -1).join(' ')
        type = sizeType[sizeType.length - 1]
      }
      alignment = metaParts.slice(1).join(', ')
    }
    
    const attributes = doc.querySelectorAll('.mon-stat-block-2024__attribute')
    let ac = 10
    let hp = '1'
    let speed = '30 ft.'
    
    for (const attr of attributes) {
      const label = attr.querySelector('.mon-stat-block-2024__attribute-label')
      const labelText = label?.textContent?.trim()
      
      if (labelText === 'AC') {
        const valueEl = attr.querySelector('.mon-stat-block-2024__attribute-value .mon-stat-block-2024__attribute-data-value')
        if (!valueEl) {
          const spanValue = attr.querySelector('.mon-stat-block-2024__attribute-value span')
          ac = parseInt(spanValue?.textContent?.trim() || '10')
        } else {
          ac = parseInt(valueEl.textContent?.trim() || '10')
        }
      } else if (labelText === 'HP') {
        const hpValue = attr.querySelector('.mon-stat-block-2024__attribute-data-value')
        const hpExtra = attr.querySelector('.mon-stat-block-2024__attribute-data-extra')
        hp = `${hpValue?.textContent?.trim() || '1'} ${hpExtra?.textContent?.trim() || ''}`.trim()
      } else if (labelText === 'Speed') {
        const speedValue = attr.querySelector('.mon-stat-block-2024__attribute-data-value')
        speed = cleanText(speedValue?.textContent || '30 ft.')
      }
    }
    
    const str = parseAbilityScore(doc, 'STR')
    const dex = parseAbilityScore(doc, 'DEX')
    const con = parseAbilityScore(doc, 'CON')
    const int = parseAbilityScore(doc, 'INT')
    const wis = parseAbilityScore(doc, 'WIS')
    const cha = parseAbilityScore(doc, 'CHA')
    
    const tidbits = doc.querySelectorAll('.mon-stat-block-2024__tidbit')
    let skills = ''
    let resistances = ''
    let immunities = ''
    let gear = ''
    let senses = ''
    let languages = ''
    let cr = '0'
    
    for (const tidbit of tidbits) {
      const label = tidbit.querySelector('.mon-stat-block-2024__tidbit-label')?.textContent?.trim()
      const data = tidbit.querySelector('.mon-stat-block-2024__tidbit-data')
      const dataText = cleanText(data?.textContent || '')
      
      switch (label) {
        case 'Skills':
          skills = dataText
          break
        case 'Resistances':
          resistances = dataText
          break
        case 'Immunities':
          immunities = dataText
          break
        case 'Gear':
          gear = dataText
          break
        case 'Senses':
          senses = dataText
          break
        case 'Languages':
          languages = dataText
          break
        case 'CR':
          const crMatch = dataText.match(/^(\d+\/?\d*)/)
          if (crMatch) cr = crMatch[1]
          break
      }
    }
    
    const traits = parseAbilities(doc, 'Traits')
    const actions = parseAbilities(doc, 'Actions')
    const bonusActions = parseAbilities(doc, 'Bonus Actions')
    const reactions = parseAbilities(doc, 'Reactions')
    const legendaryActions = parseAbilities(doc, 'Legendary Actions')
    
    return {
      size,
      type,
      alignment,
      ac,
      hp,
      speed,
      abilityScores: { str, dex, con, int, wis, cha },
      skills: skills || undefined,
      resistances: resistances || undefined,
      immunities: immunities || undefined,
      gear: gear || undefined,
      senses: senses || undefined,
      languages: languages || undefined,
      cr,
      traits: traits.length > 0 ? traits : undefined,
      actions: actions.length > 0 ? actions : undefined,
      bonusActions: bonusActions.length > 0 ? bonusActions : undefined,
      reactions: reactions.length > 0 ? reactions : undefined,
      legendaryActions: legendaryActions.length > 0 ? legendaryActions : undefined,
    }
  } catch (error) {
    console.error('Error parsing monster HTML:', error)
    return null
  }
}

export async function loadMonsterFromFile(filename: string): Promise<Creature | null> {
  try {
    const response = await fetch(`/monsters/${filename}`)
    if (!response.ok) return null
    const html = await response.text()
    return parseMonsterHTML(html)
  } catch (error) {
    console.error(`Error loading monster file ${filename}:`, error)
    return null
  }
}
