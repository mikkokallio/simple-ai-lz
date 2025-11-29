/**
 * Portrait Gallery Management
 * Manages a persistent gallery of generated DALL-E portraits
 */

export interface PortraitEntry {
  id: string
  url: string
  prompt: string
  characterName?: string
  generatedAt: number
  thumbnail?: string
}

const STORAGE_KEY = 'adventure-portrait-gallery'
const MAX_PORTRAITS = 100 // Limit gallery size

/**
 * Get all portraits from the gallery
 */
export function getPortraitGallery(): PortraitEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const portraits = JSON.parse(stored) as PortraitEntry[]
    // Sort by most recent first
    return portraits.sort((a, b) => b.generatedAt - a.generatedAt)
  } catch (error) {
    console.error('Failed to load portrait gallery:', error)
    return []
  }
}

/**
 * Add a new portrait to the gallery
 */
export function addPortraitToGallery(
  url: string, 
  prompt: string, 
  characterName?: string
): PortraitEntry {
  const newPortrait: PortraitEntry = {
    id: crypto.randomUUID(),
    url,
    prompt,
    characterName,
    generatedAt: Date.now()
  }

  try {
    const gallery = getPortraitGallery()
    
    // Add new portrait at the beginning
    gallery.unshift(newPortrait)
    
    // Limit gallery size
    if (gallery.length > MAX_PORTRAITS) {
      gallery.splice(MAX_PORTRAITS)
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gallery))
    console.log(`Added portrait to gallery. Total portraits: ${gallery.length}`)
    
    return newPortrait
  } catch (error) {
    console.error('Failed to add portrait to gallery:', error)
    return newPortrait
  }
}

/**
 * Remove a portrait from the gallery
 */
export function removePortraitFromGallery(portraitId: string): void {
  try {
    const gallery = getPortraitGallery()
    const filtered = gallery.filter(p => p.id !== portraitId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    console.log(`Removed portrait ${portraitId} from gallery`)
  } catch (error) {
    console.error('Failed to remove portrait from gallery:', error)
  }
}

/**
 * Clear all portraits from the gallery
 */
export function clearPortraitGallery(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('Portrait gallery cleared')
  } catch (error) {
    console.error('Failed to clear portrait gallery:', error)
  }
}

/**
 * Search portraits by character name or prompt
 */
export function searchPortraits(query: string): PortraitEntry[] {
  const gallery = getPortraitGallery()
  const lowerQuery = query.toLowerCase().trim()
  
  if (!lowerQuery) return gallery
  
  return gallery.filter(portrait => 
    portrait.characterName?.toLowerCase().includes(lowerQuery) ||
    portrait.prompt.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get portraits generated for a specific character
 */
export function getPortraitsForCharacter(characterName: string): PortraitEntry[] {
  const gallery = getPortraitGallery()
  return gallery.filter(p => p.characterName === characterName)
}
