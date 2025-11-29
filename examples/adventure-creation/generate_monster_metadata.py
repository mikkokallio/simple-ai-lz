#!/usr/bin/env python3
"""
Script to generate monster metadata JSON from D&D Beyond HTML files.
Extracts CR, creates AI summaries, assigns theme keywords and combat roles.

Uses OpenAI GPT-4 to semantically analyze monsters and assign appropriate keywords.
"""

import os
import re
import json
import time
from pathlib import Path
from bs4 import BeautifulSoup
from openai import OpenAI

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Theme Keywords Taxonomy (100 keywords covering major D&D themes)
THEME_KEYWORDS = [
    # Setting/Environment
    "urban", "wilderness", "dungeon", "underdark", "underwater", "aerial", "desert", 
    "arctic", "forest", "swamp", "mountain", "plains", "coastal", "volcanic", "cave",
    
    # Creature Types & Origins
    "undead", "fiend", "celestial", "elemental", "fey", "aberration", "construct", 
    "dragon", "giant", "humanoid", "beast", "monstrosity", "ooze", "plant",
    
    # Campaign Themes
    "gothic-horror", "cosmic-horror", "high-fantasy", "dark-fantasy", "sword-and-sorcery",
    "planar", "extraplanar", "infernal", "abyssal", "feywild", "shadowfell",
    
    # Social/Faction
    "criminal", "military", "religious", "nobility", "peasant", "merchant", "pirate",
    "bandit", "cultist", "guard", "soldier", "assassin", "spy", "thief",
    
    # Magic & Supernatural
    "spellcaster", "magical", "arcane", "divine", "primal", "psionic", "cursed",
    "enchanted", "shapeshifter", "illusionist", "necromancer", "summoner",
    
    # Combat Style
    "melee", "ranged", "ambush", "stealthy", "brute", "tactical", "swarm",
    "mounted", "siege", "grappler", "poisonous", "venomous",
    
    # Moral Alignment Themes
    "evil", "good", "chaotic", "lawful", "neutral", "demonic", "diabolic", "holy",
    
    # Special Abilities
    "flying", "swimming", "burrowing", "climbing", "invisible", "intangible",
    "regenerating", "shapeshifting", "teleporting", "charming", "frightening",
    
    # Difficulty & Encounter Type
    "minion", "elite", "boss", "legendary", "mythic", "solo",
    
    # Specific Genres/Scenarios
    "investigation", "intrigue", "exploration", "combat-heavy", "social",
    "mystery", "heist", "war", "plague", "apocalypse"
]

# Combat Role Categories
COMBAT_ROLES = {
    "striker": "High damage dealer, focuses on eliminating priority targets",
    "tank": "High HP/AC, absorbs damage and protects allies",
    "controller": "Manipulates battlefield, crowd control, debuffs",
    "support": "Buffs allies, healing, summoning reinforcements",
    "skirmisher": "Mobile combatant, hit-and-run tactics, repositioning",
    "artillery": "Long-range damage dealer, stays at distance",
    "infiltrator": "Stealth-based, ambush specialist, espionage"
}


def extract_monster_name(soup):
    """Extract monster name from HTML."""
    name_link = soup.find('a', class_='mon-stat-block-2024__name-link')
    if name_link:
        return name_link.get_text(strip=True)
    return None


def extract_cr(soup):
    """Extract Challenge Rating from HTML."""
    cr_tidbit = soup.find('span', class_='mon-stat-block-2024__tidbit-label', string='CR')
    if cr_tidbit:
        cr_data = cr_tidbit.find_next('span', class_='mon-stat-block-2024__tidbit-data')
        if cr_data:
            cr_text = cr_data.get_text(strip=True)
            # Extract just the CR number (e.g., "3" from "3 (XP 700; PB +2)")
            match = re.match(r'(\d+(?:/\d+)?)', cr_text)
            if match:
                return match.group(1)
    return None


def extract_creature_type(soup):
    """Extract creature type/meta information."""
    meta = soup.find('div', class_='mon-stat-block-2024__meta')
    if meta:
        return meta.get_text(strip=True)
    return ""


def extract_description(soup):
    """Extract monster description."""
    desc_block = soup.find('div', class_='mon-details__description-block-content')
    if desc_block:
        # Get first paragraph as summary
        first_para = desc_block.find('p')
        if first_para:
            return first_para.get_text(strip=True)
    return ""


def extract_abilities(soup):
    """Extract monster abilities and actions."""
    abilities = []
    
    # Get traits
    trait_blocks = soup.find_all('div', class_='mon-stat-block-2024__description-block')
    for block in trait_blocks:
        heading = block.find('div', class_='mon-stat-block-2024__description-block-heading')
        if heading:
            content = block.find('div', class_='mon-stat-block-2024__description-block-content')
            if content:
                abilities.append({
                    'type': heading.get_text(strip=True),
                    'text': content.get_text(strip=True)[:200]  # First 200 chars
                })
    
    return abilities


def extract_stats(soup):
    """Extract basic stats (HP, AC, Speed, etc.)"""
    stats = {}
    
    # AC
    ac_label = soup.find('span', class_='mon-stat-block-2024__attribute-label', string='AC')
    if ac_label:
        ac_value = ac_label.find_next('span', class_='mon-stat-block-2024__attribute-data-value')
        if ac_value:
            stats['ac'] = ac_value.get_text(strip=True)
    
    # HP
    hp_label = soup.find('span', class_='mon-stat-block-2024__attribute-label', string='HP')
    if hp_label:
        hp_value = hp_label.find_next('span', class_='mon-stat-block-2024__attribute-data-value')
        if hp_value:
            stats['hp'] = hp_value.get_text(strip=True)
    
    # Speed
    speed_label = soup.find('span', class_='mon-stat-block-2024__attribute-label', string='Speed')
    if speed_label:
        speed_value = speed_label.find_next('span', class_='mon-stat-block-2024__attribute-data-value')
        if speed_value:
            stats['speed'] = speed_value.get_text(strip=True)
    
    return stats


def determine_combat_role(name, creature_type, abilities, stats, description):
    """Determine combat role based on creature characteristics."""
    text_to_analyze = f"{name} {creature_type} {description} {' '.join([a.get('text', '') for a in abilities])}"
    text_lower = text_to_analyze.lower()
    
    # Get HP for calculations
    hp = stats.get('hp', '0')
    hp_val = int(re.search(r'\d+', str(hp)).group() if re.search(r'\d+', str(hp)) else 0)
    
    # Get AC for calculations
    ac = stats.get('ac', '0')
    ac_val = int(re.search(r'\d+', str(ac)).group() if re.search(r'\d+', str(ac)) else 0)
    
    # Priority order for role determination
    
    # 1. Infiltrator - stealth/spy specialists
    if any(word in text_lower for word in ['spy', 'assassin', 'invisible', 'invisibility']):
        return "infiltrator"
    
    # 2. Support - healers and buffers
    if any(word in text_lower for word in ['heal', 'cure', 'aid', 'bless']) and 'spell' in text_lower:
        return "support"
    if any(word in text_lower for word in ['summon', 'conjure', 'animate']) and 'spell' in text_lower:
        return "support"
    
    # 3. Controller - battlefield manipulators
    if any(word in text_lower for word in ['charm', 'frighten', 'paralyze', 'stun', 'grapple', 'restrain', 'prone']):
        return "controller"
    if any(word in text_lower for word in ['area', 'cone', 'line', 'radius', 'emanation']) and 'damage' in text_lower:
        return "controller"
    
    # 4. Artillery - ranged attackers
    if any(word in text_lower for word in ['bow', 'crossbow', 'javelin', 'sling']):
        if not any(word in text_lower for word in ['melee', 'bite', 'claw']):
            return "artillery"
    if any(word in text_lower for word in ['ranged', 'range 60', 'range 80', 'range 100', 'range 120', 'range 150']):
        if 'melee' not in text_lower or text_lower.count('range') > text_lower.count('melee'):
            return "artillery"
    
    # 5. Tank - high HP/AC defenders
    if hp_val >= 100 or ac_val >= 17:
        if any(word in text_lower for word in ['protect', 'defend', 'shield', 'guard', 'parry', 'block']):
            return "tank"
        if hp_val >= 150:
            return "tank"
    
    # 6. Skirmisher - mobile hit-and-run
    if any(word in text_lower for word in ['stealth', 'hide', 'sneak']):
        if hp_val < 60:
            return "skirmisher"
    if any(word in text_lower for word in ['mobile', 'nimble', 'quick', 'agile', 'dart', 'dodge']):
        return "skirmisher"
    if 'speed' in stats and '40 ft' in stats['speed'] or '50 ft' in stats['speed'] or '60 ft' in stats['speed']:
        if hp_val < 50:
            return "skirmisher"
    
    # 7. Striker - high damage dealers (default for most combat creatures)
    if any(word in text_lower for word in ['multiattack', 'extra damage', 'critical', 'deadly']):
        return "striker"
    
    # Default assignment based on stats
    if hp_val > 100:
        return "tank"
    elif hp_val < 30 and 'stealth' in text_lower:
        return "skirmisher"
    
    return "striker"


def determine_theme_keywords(name, creature_type, abilities, description):
    """
    Use LLM to semantically analyze the monster and assign appropriate theme keywords.
    
    The LLM understands context - "rarely seen in cities" won't get 'urban' tag,
    but "city guard" will. This semantic analysis is done once during metadata
    generation, then simple keyword matching is used at runtime.
    """
    # Prepare context for LLM
    abilities_text = '\n'.join([f"- {a.get('type', 'Ability')}: {a.get('text', '')}" for a in abilities])
    
    prompt = f"""You are analyzing a D&D 5e monster to assign theme keywords for encounter filtering.

MONSTER: {name}
TYPE: {creature_type}
DESCRIPTION: {description if description else "No description available"}

ABILITIES:
{abilities_text if abilities_text else "No abilities listed"}

AVAILABLE KEYWORDS (choose UP TO 5 that best fit):
{', '.join(THEME_KEYWORDS)}

INSTRUCTIONS:
- Choose 3-5 keywords that BEST describe this monster's themes
- Use semantic understanding: "avoids cities" should NOT get 'urban', but "city guard" should
- "rarely in water" should NOT get 'underwater', but "aquatic hunter" should
- Prioritize the most distinctive and useful keywords for encounter filtering
- Include creature type, environment WHERE APPROPRIATE, and thematic elements

Return ONLY a JSON object with this structure:
{{"keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]}}

Use at most 5 keywords, at least 2. Be selective and semantic."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=150
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Parse JSON response
        # Handle markdown code blocks if present
        if '```json' in result_text:
            result_text = result_text.split('```json')[1].split('```')[0].strip()
        elif '```' in result_text:
            result_text = result_text.split('```')[1].split('```')[0].strip()
        
        result = json.loads(result_text)
        keywords = result.get('keywords', [])
        
        # Validate keywords are from the approved list
        valid_keywords = [kw for kw in keywords if kw in THEME_KEYWORDS]
        
        return valid_keywords[:5]  # Maximum 5 keywords
        
    except Exception as e:
        print(f"  ⚠️  LLM keyword generation failed for {name}: {e}")
        # Fallback to basic extraction from creature type
        return extract_basic_keywords(name, creature_type)


def extract_basic_keywords(name, creature_type):
    """
    Fallback function for basic keyword extraction when LLM fails.
    Only extracts from structured, reliable sources (creature type and name).
    """
    keywords = []
    creature_type_lower = creature_type.lower()
    
    # Creature type keywords
    for keyword in ['undead', 'fiend', 'elemental', 'fey', 'celestial', 'aberration', 
                    'construct', 'dragon', 'giant', 'beast', 'humanoid', 'monstrosity', 'ooze', 'plant']:
        if keyword in creature_type_lower:
            keywords.append(keyword)
    
    # Alignment keywords
    for keyword in ['evil', 'good', 'chaotic', 'lawful']:
        if keyword in creature_type_lower:
            keywords.append(keyword)
    
    # Name-based keywords
    name_lower = name.lower()
    name_keywords = {
        'cultist': 'cultist', 'pirate': 'pirate', 'bandit': 'bandit',
        'knight': 'military', 'guard': 'military', 'soldier': 'military',
        'mage': 'spellcaster', 'wizard': 'spellcaster'
    }
    
    for word, keyword in name_keywords.items():
        if word in name_lower and keyword not in keywords:
            keywords.append(keyword)
    
    return keywords[:5]


def generate_summary(name, creature_type, description, cr):
    """Generate a one-liner summary for UI display."""
    # Use description if available, otherwise create generic summary
    if description:
        # Truncate to first sentence or ~100 chars
        sentences = re.split(r'[.!?]', description)
        summary = sentences[0].strip() if sentences else description[:100]
        if len(summary) > 120:
            summary = summary[:117] + "..."
        return summary
    
    # Generic summary based on type
    return f"A {creature_type.lower()} of CR {cr}"


def process_monster_file(filepath):
    """Process a single monster HTML file and extract metadata."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        soup = BeautifulSoup(content, 'html.parser')
        
        name = extract_monster_name(soup)
        if not name:
            return None
        
        cr = extract_cr(soup)
        creature_type = extract_creature_type(soup)
        description = extract_description(soup)
        abilities = extract_abilities(soup)
        stats = extract_stats(soup)
        
        # Determine combat role and theme keywords
        combat_role = determine_combat_role(name, creature_type, abilities, stats, description)
        theme_keywords = determine_theme_keywords(name, creature_type, abilities, description)
        
        # Generate summary
        summary = generate_summary(name, creature_type, description, cr)
        
        return {
            "name": name,
            "file": os.path.basename(filepath),
            "cr": cr,
            "summary": summary,
            "combat_role": combat_role,
            "theme_keywords": theme_keywords,
            "creature_type": creature_type
        }
    
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return None


def main():
    """Main function to process all monster files."""
    # Check for API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("ERROR: OPENAI_API_KEY environment variable not set!")
        print("Please set it with: export OPENAI_API_KEY='your-key-here'")
        return
    
    monsters_dir = Path('/workspaces/spark-template/monsters')
    monster_files = list(monsters_dir.glob('*.html'))
    
    print(f"Found {len(monster_files)} monster files")
    print("Processing monsters with LLM-powered keyword analysis...")
    print("(This may take a while - using GPT-4o-mini for semantic keyword assignment)\n")
    
    monsters = []
    failed_count = 0
    
    for i, filepath in enumerate(sorted(monster_files), 1):
        print(f"Processing {i}/{len(monster_files)}: {filepath.name}...", end='')
        
        monster_data = process_monster_file(filepath)
        if monster_data:
            monsters.append(monster_data)
            print(f" ✓ [{', '.join(monster_data['theme_keywords'])}]")
        else:
            failed_count += 1
            print(" ✗ FAILED")
        
        # Rate limiting: small delay between requests
        if i % 10 == 0:
            print(f"  (Processed {i} monsters, taking brief pause...)")
            time.sleep(1)
    
    print(f"\n{'='*60}")
    print(f"Successfully processed {len(monsters)} monsters")
    if failed_count > 0:
        print(f"Failed to process {failed_count} monsters")
    print(f"{'='*60}\n")
    
    # Create metadata structure
    metadata = {
        "version": "1.0",
        "generated": "2025-11-23",
        "description": "Monster metadata for D&D 5e creatures, including CR, combat roles, and theme keywords",
        "combat_roles": COMBAT_ROLES,
        "theme_keywords": THEME_KEYWORDS,
        "monsters": monsters
    }
    
    # Save to JSON
    output_path = '/workspaces/spark-template/monsters-metadata.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"\nMetadata saved to: {output_path}")
    
    # Print statistics
    print("\n=== Statistics ===")
    print(f"Total monsters: {len(monsters)}")
    
    # CR distribution
    cr_counts = {}
    for m in monsters:
        cr = m.get('cr', 'Unknown')
        cr_counts[cr] = cr_counts.get(cr, 0) + 1
    print(f"\nCR distribution:")
    for cr in sorted(cr_counts.keys(), key=lambda x: (x.count('/'), float(x.split('/')[0]) if '/' in x else float(x) if x != 'Unknown' else -1)):
        print(f"  CR {cr}: {cr_counts[cr]}")
    
    # Role distribution
    role_counts = {}
    for m in monsters:
        role = m.get('combat_role', 'Unknown')
        role_counts[role] = role_counts.get(role, 0) + 1
    print(f"\nCombat role distribution:")
    for role, count in sorted(role_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {role}: {count}")
    
    # Most common keywords
    keyword_counts = {}
    for m in monsters:
        for kw in m.get('theme_keywords', []):
            keyword_counts[kw] = keyword_counts.get(kw, 0) + 1
    print(f"\nTop 20 theme keywords:")
    for kw, count in sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:20]:
        print(f"  {kw}: {count}")


if __name__ == '__main__':
    main()
