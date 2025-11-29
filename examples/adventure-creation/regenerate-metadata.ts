#!/usr/bin/env node
/**
 * Regenerate monster metadata using Spark's LLM capability
 * This runs in the browser context to access window.spark.llm()
 * 
 * Usage: Run this from the browser console or create a UI button
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { JSDOM } from 'jsdom';

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
];

// This would need to be adapted to run in browser context with window.spark.llm
// For now, providing the structure

export async function regenerateMetadataInBrowser() {
  console.log('This function should be called from the browser console where window.spark.llm is available');
  console.log('See the Python script generate_monster_metadata.py which can run with an OpenAI API key');
}
