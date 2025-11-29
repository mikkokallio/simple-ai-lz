# Encounter Types Configuration

## Overview

The encounter type system is centrally managed through a single source of truth configuration file to ensure consistency across the entire application, including the AI assistant.

## Configuration Location

**Primary Config:** `/src/lib/encounter-types.ts`

This file defines:
- All valid encounter types
- Display labels and icons for each type
- Descriptions and use cases
- Color schemes
- AI formatting instructions

## Valid Encounter Types

The system supports exactly **8 encounter types**:

1. **Combat** - Action-oriented battles with creatures or NPCs
2. **Social** - Social interactions, negotiations, and diplomacy
3. **Investigation** - Clue-gathering, detective work, and research
4. **Skill Challenge** - Complex skill-based challenges requiring multiple checks
5. **Puzzle** - Riddles, logic puzzles, and brain teasers
6. **Hazard** - Environmental dangers, traps, and natural obstacles
7. **Chase** - Pursuit sequences, escapes, and races
8. **Survival** - Wilderness challenges and resource management

## Type Values

- **Internal Type** (stored in database): lowercase with hyphens (e.g., `'combat'`, `'skill-challenge'`)
- **Display Label** (shown in UI): Title case (e.g., `'Combat'`, `'Skill Challenge'`)
- **AI Format**: The AI receives both formats and is instructed to use the lowercase internal type in JSON responses

## Architecture

### Files and Their Roles

1. **`/src/lib/encounter-types.ts`** (Primary Config)
   - Exports `ENCOUNTER_TYPES` array with full metadata
   - Exports `EncounterType` TypeScript type
   - Exports `formatEncounterTypesForAI()` function for AI system prompts
   - Contains icons, colors, descriptions, and use cases

2. **`/src/lib/encounter-templates.ts`** (Compatibility Bridge)
   - Re-exports from `encounter-types.ts`
   - Adds template-specific properties (bgColor, defaultTitle)
   - Maintains backward compatibility with existing Structure page code

3. **`/src/types/adventure.ts`**
   - Uses the `EncounterType` union type for Encounter interface
   - Ensures type safety across the application

4. **`/src/components/AICompanion.tsx`**
   - Imports `formatEncounterTypesForAI()` from encounter-types.ts
   - Injects formatted encounter type instructions into all structure-related prompts
   - Maps any legacy/incorrect type names to valid types as a fallback

### AI Integration

The AI receives encounter type information through the `formatEncounterTypesForAI()` function, which:

1. Lists all valid encounter type names
2. Provides descriptions and use cases for each type
3. Explicitly forbids invalid type names like "scene", "beat", "location", etc.
4. Shows example use cases for each type
5. Instructs the AI to use exact type values in JSON responses

Example AI prompt injection:
```typescript
import { formatEncounterTypesForAI } from '@/lib/encounter-types'

const prompt = `
${formatEncounterTypesForAI()}

Your proposed structure must use one of these exact types for each encounter...
`
```

## Adding a New Encounter Type

To add a new encounter type:

1. Add the new type to the `EncounterType` union in `/src/lib/encounter-types.ts`:
   ```typescript
   export type EncounterType = 
     | 'combat'
     | 'social'
     // ... existing types
     | 'your-new-type'  // Add here
   ```

2. Add a new entry to the `ENCOUNTER_TYPES` array:
   ```typescript
   {
     type: 'your-new-type',
     label: 'Your New Type',
     icon: YourIcon,  // Import from @phosphor-icons/react
     color: 'text-your-color',
     description: 'Description of this encounter type',
     useCases: [
       'Use case 1',
       'Use case 2',
       'Use case 3'
     ]
   }
   ```

3. The change will automatically propagate to:
   - Card Library in Structure page
   - AI system prompts
   - Type definitions
   - All UI components using encounter types

## Forbidden Type Values

The AI is explicitly instructed to **NEVER** use these values:
- `"scene"`
- `"beat"`
- `"story-beat"`
- `"location"`
- `"exploration"`
- `"rest"`
- `"climax"`
- `"social-encounter"`
- Any other value not in the official list

If the AI somehow produces these values, the `handleAcceptProposal()` function in AICompanion.tsx has a fallback `typeMap` that converts them to valid types.

## Verification

To verify the encounter type configuration is working:

1. **Check Card Library:** Open Structure page and verify all 8 types appear in the card library
2. **Check AI Output:** Ask the AI to create an adventure structure and verify it only uses the 8 valid types
3. **Check Type Safety:** TypeScript should catch any invalid type assignments at compile time

## Maintenance

When modifying encounter types:

1. ✅ **DO** modify `/src/lib/encounter-types.ts` only
2. ✅ **DO** ensure the AI prompt formatting includes all new types
3. ✅ **DO** update this documentation
4. ❌ **DON'T** modify encounter type definitions in multiple files
5. ❌ **DON'T** add types without updating the AI formatting function
6. ❌ **DON'T** use inconsistent capitalization or naming

## Testing Checklist

After modifying encounter types:

- [ ] All encounter types appear in Structure page Card Library
- [ ] AI companion receives updated encounter type list (check console logs)
- [ ] AI proposals only use valid encounter types
- [ ] TypeScript compilation succeeds without type errors
- [ ] Existing encounters still display correctly
- [ ] New encounters can be created with all types
