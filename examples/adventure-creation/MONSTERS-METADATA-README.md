# Monster Metadata Documentation

## Overview

The `monsters-metadata.json` file contains structured metadata for all 509 D&D 5e creatures from the monsters folder. This metadata enables AI-powered encounter generation by providing semantic information about each creature.

## File Structure

```json
{
  "version": "1.0",
  "generated": "2025-11-23",
  "description": "...",
  "combat_roles": { ... },
  "theme_keywords": [ ... ],
  "monsters": [ ... ]
}
```

## Combat Roles

Each monster is assigned exactly ONE combat role that describes its tactical function in encounters:

- **Striker** (153 creatures): High damage dealers that focus on eliminating priority targets
- **Controller** (100 creatures): Manipulates battlefield with crowd control and debuffs
- **Skirmisher** (83 creatures): Mobile combatants using hit-and-run tactics
- **Tank** (79 creatures): High HP/AC creatures that absorb damage and protect allies
- **Artillery** (50 creatures): Long-range damage dealers that stay at distance
- **Support** (28 creatures): Buffs allies, provides healing, summons reinforcements
- **Infiltrator** (16 creatures): Stealth-based ambush specialists for espionage

## Theme Keywords

Each monster has multiple theme keywords (average: 4.4 per creature) from a taxonomy of 100 keywords. These help AI assistants select creatures appropriate for specific adventure themes.

### Keyword Categories

**Creature Types**: undead, fiend, celestial, elemental, fey, aberration, construct, dragon, giant, humanoid, beast, monstrosity, ooze, plant

**Environments**: urban, wilderness, dungeon, underdark, underwater, aerial, desert, arctic, forest, swamp, mountain, plains, coastal, volcanic, cave

**Campaign Themes**: gothic-horror, cosmic-horror, high-fantasy, dark-fantasy, sword-and-sorcery, planar, extraplanar, infernal, abyssal, feywild, shadowfell

**Social Roles**: criminal, military, religious, nobility, peasant, merchant, pirate, bandit, cultist, guard, soldier, assassin, spy, thief

**Magic Types**: spellcaster, magical, arcane, divine, primal, psionic, cursed, enchanted, shapeshifter, illusionist, necromancer, summoner

**Combat Styles**: melee, ranged, ambush, stealthy, brute, tactical, swarm, mounted, siege, grappler, poisonous, venomous

**Alignment**: evil, good, chaotic, lawful, neutral, demonic, diabolic, holy

**Special Abilities**: flying, swimming, burrowing, climbing, invisible, intangible, regenerating, shapeshifting, teleporting, charming, frightening

**Difficulty Tiers**: minion, elite, boss, legendary, mythic, solo

**Scenarios**: investigation, intrigue, exploration, combat-heavy, social, mystery, heist, war, plague, apocalypse

## Monster Entry Format

```json
{
  "name": "Yuan-ti Malison (Type 2)",
  "file": "5195291-yuan-ti-malison-type-2.html",
  "cr": "3",
  "summary": "Malisons exhibit snakelike features that make them deadly in combat",
  "combat_role": "striker",
  "theme_keywords": ["evil", "monstrosity", "poisonous", "shapeshifter", "spellcaster"],
  "creature_type": "Medium Monstrosity, Neutral Evil"
}
```

### Fields

- **name**: Display name of the creature
- **file**: Reference to the HTML stat block file in `/monsters/`
- **cr**: Challenge Rating (e.g., "3", "1/2", "1/4")
- **summary**: One-sentence description for UI display (~100-120 characters)
- **combat_role**: Single role from the 7 combat role categories
- **theme_keywords**: Array of thematic tags for encounter selection
- **creature_type**: Full creature type with size and alignment

## Usage Examples

### Filter by CR Range
```javascript
const midTierMonsters = monsters.filter(m => {
  const cr = m.cr.includes('/') ? parseFloat(m.cr.split('/')[0]) / parseFloat(m.cr.split('/')[1]) : parseFloat(m.cr);
  return cr >= 3 && cr <= 6;
});
```

### Find Creatures for Gothic Horror
```javascript
const gothicMonsters = monsters.filter(m => 
  m.theme_keywords.includes('gothic-horror') || 
  m.theme_keywords.includes('undead')
);
```

### Build Balanced Encounter
```javascript
// Get 1 tank, 2 strikers, 1 controller at CR 3-5
const encounter = {
  tank: monsters.find(m => m.combat_role === 'tank' && m.cr === '4'),
  strikers: monsters.filter(m => m.combat_role === 'striker' && m.cr === '3').slice(0, 2),
  controller: monsters.find(m => m.combat_role === 'controller' && m.cr === '5')
};
```

### Theme-Based Selection
```javascript
// Urban intrigue adventure
const urbanCreatures = monsters.filter(m => 
  m.theme_keywords.some(k => ['urban', 'intrigue', 'criminal', 'spy', 'assassin'].includes(k))
);
```

## Statistics

- **Total Monsters**: 509
- **CR Range**: 0 to 30
- **Most Common CR**: CR 2 (59 creatures)
- **Keywords in Use**: 64 out of 100 available
- **Average Keywords per Monster**: 4.4

### Top Theme Keywords
1. evil (200)
2. chaotic (111)
3. wilderness (108)
4. flying (108)
5. planar (106)
6. beast (91)
7. lawful (90)
8. spellcaster (83)
9. poisonous (68)
10. monstrosity (60)

## Generation

The metadata was generated using `generate_monster_metadata.py`, which:
1. Parses HTML stat blocks using BeautifulSoup
2. Extracts CR, stats, abilities, and descriptions
3. Uses AI-like reasoning to assign combat roles based on abilities and stats
4. Applies thematic keywords based on creature type, environment, and special abilities
5. Generates concise summaries for UI display

The keyword assignment uses intelligent heuristics to avoid false positives (e.g., simple beasts don't get "spellcaster" tags unless they actually cast spells).

## Future Enhancements

Potential additions to the metadata:
- Environment habitat tags from the HTML footer
- Treasure type information
- Size category (Tiny, Small, Medium, Large, Huge, Gargantuan)
- Legendary/Mythic status flags
- Source book references
- Related creatures (variants, pack members)
- Difficulty modifiers for specific party compositions
