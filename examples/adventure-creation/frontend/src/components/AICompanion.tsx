import { useState, useRef, useEffect } from 'react'
import { Adventure, Encounter, NPC } from '@/types/adventure'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sparkle, PaperPlaneTilt, X, Check, XCircle, CaretRight } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { celebrateCardAddition } from '@/lib/confetti'
import { clampPositionToBounds, CANVAS_BOUNDS } from '@/lib/layout-algorithm'
import { getStructureTypeRequirements, validateStructure } from '@/lib/graph-validation'
import { parseJsonSafely } from '@/lib/json-utils'
import { llmPrompt } from '@/lib/utils'
import { calculateXPBudget, crToXP, type EncounterDifficulty } from '@/lib/encounterCalculator'
import { filterMonsters, type MonsterMetadata as MonsterMetadataType } from '@/lib/monsterFiltering'
import { generateCombos, formatComboDescription, getComboStats, type ComboSuggestion } from '@/lib/comboGenerator'
import { ENCOUNTER_TYPES, formatEncounterTypesForAI, type EncounterType } from '@/lib/encounter-types'

function parseCR(cr: string): number {
  if (cr === '0') return 0
  if (cr === '1/8') return 0.125
  if (cr === '1/4') return 0.25
  if (cr === '1/2') return 0.5
  return parseFloat(cr) || 0
}

interface AICompanionProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
  isCollapsed: boolean
  onToggle: () => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  proposal?: CardProposal
  proposalStatus?: 'pending' | 'accepted' | 'rejected'
  overviewProposal?: OverviewProposal
  overviewProposalStatus?: 'pending' | 'accepted' | 'rejected'
  monsterProposal?: MonsterProposal
  monsterProposalStatus?: 'pending' | 'accepted' | 'rejected'
  npcProposal?: NPCProposal
  npcProposalStatus?: 'pending' | 'accepted' | 'rejected'
  clarificationQuestion?: ClarificationQuestion
  clarificationStatus?: 'pending' | 'answered'
  keywordSuggestion?: KeywordSuggestion
  keywordSuggestionStatus?: 'pending' | 'accepted' | 'rejected'
}

interface KeywordSuggestion {
  keywords: string[]
  reasoning: string
  userRequest: string
  encounterContext: {
    title: string
    difficulty: string
    partyLevel: number
    partySize: number
  }
}

interface ClarificationQuestion {
  question: string
  context: string
}

interface CardProposal {
  cards: ProposedCard[]
  edits: ProposedEdit[]
  connections: ProposedConnection[]
  explanation: string
}

interface OverviewProposal {
  title?: string
  pitch?: string
  themes?: string[]
  partyLevelMin?: number
  partyLevelMax?: number
  playerCount?: number
  structureType?: 'act-based' | 'branching' | 'sandbox' | 'decide-later'
  coreConflict?: string
  antagonistGoals?: string
  explanation: string
}

interface MonsterProposal {
  encounterId: string
  encounterTitle: string
  monsters: ProposedMonster[]
  explanation: string
  reasoning: string
  totalXP?: number
  budgetXP?: number
}

interface NPCProposal {
  npcs: ProposedNPC[]
  explanation: string
  isAntagonist?: boolean
}

interface ProposedNPC {
  name: string
  role: string
  appearance: string
  personality: string
  secrets?: string[]
  creatureFile?: string
}

interface ProposedMonster {
  filename: string
  name: string
  cr: string
  role: string
  count: number
  reasoning: string
}

interface ProposedCard {
  type: string
  title: string
  description: string
  position: { x: number; y: number }
  tempId: string
}

interface ProposedEdit {
  encounterId: string
  currentTitle: string
  newTitle: string
  currentDescription: string
  newDescription: string
  changeReason: string
}

interface ProposedConnection {
  from: string
  to: string
  fromSide: 'left' | 'right'
  toSide: 'left' | 'right'
}

export default function AICompanion({ adventure, updateAdventure, isCollapsed, onToggle }: AICompanionProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: getStageGreeting(adventure.stage, adventure),
      timestamp: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousStageRef = useRef<string>(adventure.stage)
  const pendingMonsterContextRef = useRef<{
    filteredMonsters: any[]
    budget: number
    targetEncounter: Encounter
    encounterContext: { title: string, partyLevel: number, partySize: number, difficulty: string }
    keywords: string[]
    userRequest: string
  } | null>(null)

  useEffect(() => {
    // Only add a new greeting message if the stage has actually changed
    if (previousStageRef.current !== adventure.stage) {
      previousStageRef.current = adventure.stage
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: getStageGreeting(adventure.stage, adventure),
          timestamp: Date.now(),
        },
      ])
    }
  }, [adventure.stage])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Check if user is confirming pending monster context after keyword acceptance
    const isConfirmation = /\b(go ahead|proceed|continue|yes|yeah|yep|okay|ok|sure|do it|let'?s go)\b/i.test(userMessage.content)
    if (pendingMonsterContextRef.current && isConfirmation) {
      const context = pendingMonsterContextRef.current
      pendingMonsterContextRef.current = null // Clear the pending context
      
      console.log('User confirmed - proceeding with monster suggestions...')
      console.log(`Applying keywords: ${context.keywords.join(', ')}`)
      
      // Apply intelligent keyword filtering that prioritizes multiple matches
      // and deprioritizes generic keywords like 'urban'
      let filteredMonsters = context.filteredMonsters
      const scoredMonsters = filteredMonsters.map((monster: any) => {
        const monsterKeywords = (monster.theme_keywords || []).map((k: string) => k.toLowerCase())
        let score = 0
        let matchedKeywords: string[] = []
        
        context.keywords.forEach((keyword: string) => {
          const kw = keyword.toLowerCase()
          if (monsterKeywords.includes(kw)) {
            matchedKeywords.push(keyword)
            // Urban is over-applied, give it low weight
            if (kw === 'urban') {
              score += 1
            } else {
              score += 10
            }
          }
        })
        
        return { monster, score, matchedKeywords }
      })
      
      // Sort by score (highest first) and take monsters with score > 0
      const keywordFiltered = scoredMonsters
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.monster)
      
      console.log(`Keyword filtering: ${filteredMonsters.length} → ${keywordFiltered.length} monsters`)
      
      if (keywordFiltered.length >= 10) {
        filteredMonsters = keywordFiltered.slice(0, 80)
      } else if (keywordFiltered.length > 0) {
        console.warn('Keyword filtering produced few results, keeping top matches')
        filteredMonsters = keywordFiltered
      } else {
        console.warn('No keyword matches, using all filtered monsters')
      }

      // Apply final diversity filter if needed
      if (filteredMonsters.length > 80) {
        const byCR = new Map<string, any[]>()
        filteredMonsters.forEach((m: any) => {
          if (!byCR.has(m.cr)) byCR.set(m.cr, [])
          byCR.get(m.cr)!.push(m)
        })
        
        const diverseMonsters: any[] = []
        Array.from(byCR.values()).forEach(crGroup => {
          diverseMonsters.push(...crGroup.slice(0, 8))
        })
        
        filteredMonsters = diverseMonsters.slice(0, 80)
      }

      console.log(`Final filtered list: ${filteredMonsters.length} monsters`)
      
      // Create a dummy message object with keywordSuggestion for continueMonsterSuggestion
      const keywordMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        keywordSuggestion: {
          keywords: context.keywords,
          reasoning: '',
          userRequest: context.userRequest,
          encounterContext: context.encounterContext
        }
      }
      
      await continueMonsterSuggestion(
        filteredMonsters,
        context.budget,
        context.targetEncounter,
        context.encounterContext,
        keywordMessage
      )
      return
    }

    try {
      const stageContext = buildStageContext(adventure)
      
      const shouldProposeCards = adventure.stage === 'structure'
      const shouldProposeOverview = adventure.stage === 'overview'

      if (shouldProposeCards) {
        const isInitialRequest = adventure.structure.encounters.length === 0 && 
          (userMessage.content.toLowerCase().includes('create') || 
           userMessage.content.toLowerCase().includes('generate') ||
           userMessage.content.toLowerCase().includes('build') ||
           userMessage.content.toLowerCase().includes('structure'))

        const userHasStatedStructureType = 
          userMessage.content.toLowerCase().includes('linear') ||
          userMessage.content.toLowerCase().includes('act-based') ||
          userMessage.content.toLowerCase().includes('branching') ||
          userMessage.content.toLowerCase().includes('sandbox') ||
          userMessage.content.toLowerCase().includes('open world')

        if (isInitialRequest && !userHasStatedStructureType) {
          const clarificationPrompt = llmPrompt`You are a helpful AI companion helping to design a tabletop RPG adventure. The user has just asked: ${userMessage.content}

${stageContext}

TASK: Determine if you need to ask clarifying questions before proposing a full adventure structure.

CRITICAL: Check if the user has already specified a structure type:
- linear, act-based = linear structure
- branching = branching structure  
- sandbox, open world, open-ended = sandbox structure

If they HAVE specified a type, DO NOT ask about structure type again. Respect their choice.

Consider asking about:
1. Structure type - ONLY if they have not mentioned linear/branching/sandbox
2. Tone/themes - What mood should the adventure have?
3. Key elements - Any specific locations, NPCs, or plot points they want included?
4. Scope - How long should the adventure be?

Return ONLY a valid JSON object with NO additional text before or after:
{
  "needsClarification": true or false,
  "question": "A single direct question under 150 chars or empty string",
  "context": "Brief explanation under 100 chars",
  "suggestBranching": true or false - true ONLY if their request sounds like it would benefit from a branching/sandbox structure AND they have not already specified a type
}

CRITICAL JSON RULES:
- All property names in double quotes
- All string values in double quotes
- NO newlines inside strings - use spaces
- NO unescaped quotes or apostrophes
- Keep strings SHORT - question max 150 chars, context max 100 chars
- Only set needsClarification to true if the request is vague or missing important details`

          const clarificationResponse = await window.spark.llm(clarificationPrompt, 'gpt-4o', true)
          
          console.log('Raw LLM response (clarification):', clarificationResponse.substring(0, 300))
          
          let clarification
          try {
            clarification = parseJsonSafely(clarificationResponse)
          } catch (parseError) {
            console.error('Failed to parse clarification response')
            console.error('Full response:', clarificationResponse)
            console.error('Parse error:', parseError)
            throw new Error(`Invalid JSON in clarification response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
          }

          if (clarification.needsClarification) {
            let questionText = clarification.question
            if (clarification.suggestBranching && !userHasStatedStructureType) {
              questionText += " Your adventure sounds like it could work great as a branching or sandbox structure, giving players meaningful choices. Would you like me to design it that way?"
            }

            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: questionText,
              timestamp: Date.now(),
              clarificationQuestion: {
                question: clarification.question,
                context: clarification.context
              },
              clarificationStatus: 'pending'
            }
            setMessages((prev) => [...prev, assistantMessage])
            setIsLoading(false)
            return
          }
        }

        const structureTypeInfo = { description: 'flexible structure', requirements: [] }
        
        const connectivityRules = 'FLEXIBLE: Create appropriate structure based on the adventure needs. You can propose linear, branching, or sandbox structures as fits best. Consider the adventure pitch and themes when deciding on structure. Explain your structural choices.'

        const proposalPrompt = llmPrompt`You are an EAGER and PROACTIVE AI companion helping design tabletop RPG adventure structures. You can both ADD new cards and EDIT existing cards.

IMPORTANT TONE GUIDELINES:
- Speak DIRECTLY to the user using you and we
- DO NOT refer to the user in third person - NEVER say the user or they mentioned
- Use first-person plural for collaborative actions: Lets build, We can create, I will help you
- Use second-person for user actions: You mentioned, You are creating, Your adventure
- Be friendly enthusiastic and direct

${stageContext}

User asked: ${userMessage.content}

STRUCTURE REQUIREMENTS:
Create an appropriate structure based on the adventure needs. Consider the adventure pitch, themes, and player requirements when designing the structure.

YOU SHOULD FOLLOW THESE CONNECTIVITY PRINCIPLES:
${connectivityRules}

CONNECTION DIRECTIONALITY RULE - ABSOLUTELY CRITICAL:
ALL connections MUST go from a RIGHT node to a LEFT node ONLY.
NEVER create connections from left to left, right to right, or left to right.
ONLY right-to-left connections are allowed.
In your connections array ALWAYS use: "fromSide": "right" and "toSide": "left"

TERMINAL ENCOUNTERS RULE:
- Generally ALL non-terminal encounters should lead to at least one other encounter
- Only the final resolution/epilogue encounters should be terminal with no outgoing connections
- If an encounter does not lead anywhere it should be intentionally designed as an ending

CAPABILITIES:
1. ADD NEW CARDS: When user wants to add content or expand the structure
2. EDIT EXISTING CARDS: When user wants to modify rename or change the theme/tone of existing cards

Return ONLY a valid JSON object with NO additional text before or after - use this exact structure:
{
  "shouldPropose": true or false,
  "explanation": "Brief friendly DIRECT explanation using you and we - 2 to 3 sentences maximum - keep under 200 characters - use only basic punctuation",
  "cards": [{"tempId": "string", "type": "combat|social|investigation|puzzle|hazard|chase|survival|skill-challenge", "title": "string under 50 chars", "description": "string under 150 chars", "position": {"x": number, "y": number}}],
  "edits": [{"encounterId": "string", "currentTitle": "string", "newTitle": "string under 50 chars", "currentDescription": "string", "newDescription": "string under 150 chars", "changeReason": "string under 100 chars"}],
  "connections": [{"from": "string", "to": "string", "fromSide": "right", "toSide": "left"}]
}

CRITICAL JSON RULES:
- All property names MUST be in double quotes
- All string values MUST be in double quotes
- NO newlines inside string values - use spaces instead
- NO unescaped quotes inside strings
- NO trailing commas
- Keep all strings SHORT to avoid truncation
- Maximum string lengths: title 50 chars, description 150 chars, explanation 200 chars

CARD POSITIONING: Canvas boundaries are x from ${CANVAS_BOUNDS.minX} to ${CANVAS_BOUNDS.maxX - 200} and y from ${CANVAS_BOUNDS.minY} to ${CANVAS_BOUNDS.maxY - 120}. If canvas is empty start at x 100 y 100 with 250px spacing. Use multiples of 20 for grid snapping.

!!!CRITICAL: ENCOUNTER TYPE SELECTION - THESE ARE THE ONLY VALID TYPES!!!
${formatEncounterTypesForAI()}

ABSOLUTELY FORBIDDEN: Do NOT use "location", "social-encounter", "exploration", "rest", "climax", "scene", "beat", or any other value not listed above. Cards represent ENCOUNTERS not locations or scenes.

!!!ENCOUNTER TYPE DIVERSITY - MANDATORY REQUIREMENT!!!
CRITICAL: Adventures MUST have encounter type diversity. NEVER create an adventure with only one or two encounter types.
- MINIMUM: Any adventure with 4+ cards MUST use at least 3 DIFFERENT encounter types
- IDEAL: Spread cards across 4-6 different types for maximum variety
- FORBIDDEN: Do NOT create adventures where all or most cards are the same type (e.g., all "combat", all "investigation", all "social")
- BALANCE: Even combat-focused adventures need investigation, social, and other types. Even investigation-focused adventures need some combat and social encounters.
- EXAMPLE GOOD MIX for 8 cards: 3 combat, 2 social, 1 investigation, 1 puzzle, 1 skill-challenge
- EXAMPLE BAD MIX for 8 cards: 7 combat, 1 social ← FORBIDDEN
- Consider the adventure's themes and content to create varied encounter types

STRUCTURE BEST PRACTICES: 3-Act Structure uses 6 to 9 cards total. Build intensity gradually. Place hazard or survival cards after intense combat sequences. Mix encounter types throughout the adventure to create engaging variety.

BE PROACTIVE! Default to proposing cards or edits unless explicitly just asking for definitions or theoretical information.`

        let proposalResponse = await window.spark.llm(proposalPrompt, 'gpt-4o', true)
        
        console.log('Raw LLM response (proposal):', proposalResponse.substring(0, 500))
        
        let proposal
        try {
          proposal = parseJsonSafely(proposalResponse)
        } catch (parseError) {
          console.error('Failed to parse AI response as JSON')
          console.error('Full response:', proposalResponse)
          console.error('Parse error:', parseError)
          throw new Error(`Invalid JSON response from AI: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
        }

        if (proposal.shouldPropose && proposal.cards?.length > 0) {
          const simulatedStructure = {
            encounters: [
              ...adventure.structure.encounters,
              ...proposal.cards.map((card: ProposedCard) => ({
                id: card.tempId,
                title: card.title,
                description: card.description,
                type: card.type,
                linkedFactions: [],
                linkedLocations: [],
                position: card.position
              }))
            ],
            connections: [
              ...adventure.structure.connections,
              ...(proposal.connections || [])
            ]
          }

          const validation = validateStructure(simulatedStructure, 'decide-later')

          if (!validation.isValid && proposal.cards.length > 0) {
            const validationErrorsList = validation.errors.map(e => `- ${e}`).join(' ')
            
            const retryPrompt = llmPrompt`Your previous proposal did NOT meet the structural requirements. Here is what went wrong:

ADVENTURE CONTEXT - REMEMBER THIS:
User originally asked: ${userMessage.content}
Adventure pitch: ${adventure.overview.pitch || 'Not set'}
Adventure themes: ${adventure.overview.themes.join(', ') || 'Not set'}

STRUCTURE REQUIREMENTS:
Create an appropriate structure for this adventure based on its themes and content.

VALIDATION ERRORS:
${validationErrorsList}

METRICS FROM YOUR PROPOSAL:
- Total encounters after adding yours: ${validation.metrics.totalEncounters}
- Total connections: ${validation.metrics.totalConnections}
- Average connections per encounter: ${validation.metrics.avgConnectionsPerEncounter}
- Branch points: ${validation.metrics.branches}
- Isolated encounters: ${validation.metrics.isolatedEncounters}

${structureTypeInfo}

YOUR PREVIOUS PROPOSAL was INVALID:
Cards: ${proposal.cards.length}
Connections: ${proposal.connections?.length || 0}

CONNECTION DIRECTIONALITY RULE - ABSOLUTELY CRITICAL:
ALL connections MUST go from a RIGHT node to a LEFT node ONLY.
NEVER create connections from left to left, right to right, or left to right.
ONLY right-to-left connections are allowed.
In your connections array ALWAYS use: "fromSide": "right" and "toSide": "left"

YOU MUST FIX THIS. Create a NEW proposal that:
1. Creates an appropriate structure for this adventure
2. Fixes all the validation errors listed above
3. Creates proper connectivity patterns
4. KEEPS THE SAME THEME AND TONE from the adventure pitch and user request
5. DO NOT create generic placeholder content - use the adventure themes
6. ONLY creates connections from right nodes to left nodes

Return ONLY valid JSON with NO text before or after - same format as before:
{
  "shouldPropose": true,
  "explanation": "string under 200 chars",
  "cards": [{"tempId": "uuid", "type": "combat|social|investigation|puzzle|hazard|chase|survival|skill-challenge", "title": "max 50 chars", "description": "max 150 chars", "position": {"x": num, "y": num}}],
  "edits": [],
  "connections": [{"from": "id", "to": "id", "fromSide": "right", "toSide": "left"}]
}

CRITICAL: NO newlines in strings, all property names in quotes, keep strings SHORT.`

            const retryResponse = await window.spark.llm(retryPrompt, 'gpt-4o', true)
            
            console.log('Raw LLM response (retry):', retryResponse.substring(0, 500))
            
            try {
              proposal = parseJsonSafely(retryResponse)
            } catch (parseError) {
              console.error('Failed to parse retry response')
              console.error('Full response:', retryResponse)
              console.error('Parse error:', parseError)
              throw new Error(`Invalid JSON in retry response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
            }

            const revalidation = validateStructure({
              encounters: [
                ...adventure.structure.encounters,
                ...proposal.cards.map((card: ProposedCard) => ({
                  id: card.tempId,
                  title: card.title,
                  description: card.description,
                  type: card.type,
                  linkedFactions: [],
                  linkedLocations: [],
                  position: card.position
                }))
              ],
              connections: [
                ...adventure.structure.connections,
                ...(proposal.connections || [])
              ]
            }, 'decide-later')

            if (!revalidation.isValid) {
              console.warn('AI still produced invalid structure after retry:', revalidation.errors)
            }
          }
        }

        if (proposal.shouldPropose && (proposal.cards?.length > 0 || proposal.edits?.length > 0)) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: proposal.explanation,
            timestamp: Date.now(),
            proposal: {
              cards: proposal.cards || [],
              edits: proposal.edits || [],
              connections: proposal.connections || [],
              explanation: proposal.explanation
            },
            proposalStatus: 'pending'
          }
          setMessages((prev) => [...prev, assistantMessage])
        } else {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: proposal.explanation,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMessage])
        }
      } else if (shouldProposeOverview) {
        // Check if user is asking for antagonist creation in Overview
        const shouldCreateAntagonist = 
          userMessage.content.toLowerCase().includes('antagonist') &&
          (userMessage.content.toLowerCase().includes('create') ||
           userMessage.content.toLowerCase().includes('add') ||
           userMessage.content.toLowerCase().includes('suggest') ||
           userMessage.content.toLowerCase().includes('generate'))

        if (shouldCreateAntagonist) {
          console.log('User requesting antagonist creation from Overview stage...')

          // Load monster metadata for creature assignment suggestions
          let monsterMetadata: any = null
          try {
            const response = await fetch('/monsters-metadata.json')
            monsterMetadata = await response.json()
          } catch (error) {
            console.error('Failed to load monster metadata:', error)
          }

          const monsterContext = monsterMetadata ? `
MONSTER LIBRARY ACCESS:
You have access to a comprehensive library of 500+ D&D 5e creatures for antagonist stat blocks.
Available creature types: aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant, undead
CR range: 0 to 30
Combat roles: striker, tank, controller, support, skirmisher, artillery, infiltrator

For antagonists, suggest an appropriate creature from the library by including a "creatureFile" field. Good options include:
- Cultist Fanatic (4904746-cultist-fanatic.html) - CR 2 religious zealot
- Knight (4904816-knight.html) - CR 3 armored warrior
- Mage (4831023-mage.html) - CR 6 spellcaster
- Berserker (4904621-berserker.html) - CR 2 fierce warrior
- Bugbear Warrior (4831002-bugbear-warrior.html) - CR 2 savage raider
` : ''

          const antagonistPrompt = llmPrompt`You are an AI assistant helping create an antagonist NPC for a D&D 5e adventure.

${stageContext}

The user has requested: "${userMessage.content}"

${monsterContext}

Your task is to propose ONE antagonist NPC based on the adventure's themes, level range, and conflict. This NPC will be automatically added to the adventure and selected as an antagonist.

CRITICAL RULES FOR APPEARANCE:
The "appearance" field MUST include:
1. Race/species (human, elf, dwarf, tiefling, dragonborn, etc.)
2. Gender (male, female, non-binary)
3. Physical details (age, build, height, distinctive features, clothing, intimidating features)

Example: "A tall female human necromancer with pale skin, sunken eyes glowing with purple energy, and long black hair streaked with white. She wears flowing dark robes adorned with bone charms and carries herself with cold arrogance."

RESPONSE FORMAT (JSON only, no markdown):
{
  "shouldPropose": true/false,
  "npc": {
    "name": "Antagonist name",
    "role": "Antagonist",
    "appearance": "DETAILED appearance including race, gender, and physical description",
    "personality": "Personality traits, mannerisms, goals, motivations - make them compelling",
    "secrets": ["Hidden goal or secret", "Another secret that could be discovered"],
    "creatureFile": "Suggested creature file for combat stats (e.g., 4904746-cultist-fanatic.html)"
  },
  "explanation": "Brief explanation of why this antagonist fits the adventure"
}

Make the antagonist appropriate for the party level (${adventure.overview.partyLevelAverage}) and compelling for the adventure themes.
If shouldPropose is false, provide a helpful explanation instead.`

          const antagonistResponse = await window.spark.llm(antagonistPrompt, 'gpt-4o', true)
          console.log('Antagonist LLM response:', antagonistResponse)

          let antagonistProposal: any
          try {
            antagonistProposal = parseJsonSafely(antagonistResponse)
          } catch (parseError) {
            console.error('Failed to parse antagonist response')
            console.error('Full response:', antagonistResponse)
            console.error('Parse error:', parseError)
            throw new Error(`Invalid JSON in antagonist response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
          }

          if (antagonistProposal.shouldPropose && antagonistProposal.npc) {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `I've created an antagonist for your adventure:\n\n**${antagonistProposal.npc.name}** - ${antagonistProposal.npc.role}\n\n${antagonistProposal.explanation}\n\nWould you like to add this antagonist to your adventure? They will appear in the NPCs view and be automatically selected as the main antagonist.`,
              timestamp: Date.now(),
              npcProposal: {
                npcs: [antagonistProposal.npc],
                explanation: antagonistProposal.explanation,
                isAntagonist: true // Special flag to mark as antagonist
              },
              npcProposalStatus: 'pending'
            }
            setMessages((prev) => [...prev, assistantMessage])
          } else {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: antagonistProposal.explanation || "I couldn't generate an antagonist. Could you tell me more about what kind of antagonist you're looking for?",
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, assistantMessage])
          }
        } else {
          // Regular overview proposal
          const overviewPrompt = llmPrompt`You are a helpful and PROACTIVE AI companion helping design a tabletop RPG adventure. You can suggest improvements to the adventure overview including title pitch themes and party details.

IMPORTANT TONE GUIDELINES:
- Speak DIRECTLY to the user using you and we
- DO NOT refer to the user in third person - NEVER say the user or they mentioned
- Use first-person plural for collaborative actions
- Use second-person for user actions
- Be friendly enthusiastic and direct

${stageContext}

User asked: ${userMessage.content}

CAPABILITIES:
You can propose changes to any combination of:
- Title: A compelling adventure name
- Pitch: 2 to 4 sentences describing the adventure
- Themes: Campaign themes from D&D 5e settings
- Party Details: Level range 1 to 20 and player count 1 to 8
- Structure Type: act-based (linear), branching, sandbox, or decide-later
- Core Conflict: The central tension or problem driving the adventure
- Antagonist Goals: What the antagonists want to achieve (if antagonists have been selected)

AVAILABLE THEMES use these exact names:
High Fantasy Dark Fantasy Gothic Horror Urban Fantasy Sword and Sorcery Dungeon Delving Wilderness Exploration Political Intrigue Mystery and Investigation Heist and Espionage War and Conflict Planar Travel Underdark Nautical and Pirates Desert and Exotic Fey and Feywild Divine and Celestial Infernal and Demonic Undead and Necromancy Dragon-Centric Ancient Ruins Arena and Gladiators Frontier and Colonization Apocalyptic Ravenloft Eberron Spelljammer Oriental Adventures Norse and Viking Celtic and Druidic Egyptian and Pharaohs Greek and Mythic Lovecraftian Steampunk Magic Comedy and Whimsy Gritty and Realistic Epic and Legendary Low Magic Wild Magic Survival and Horror

Return ONLY a valid JSON object with NO additional text:
{
  "shouldPropose": true or false,
  "explanation": "Brief friendly explanation under 200 chars - use you and we",
  "title": "New title or omit to keep current - max 60 chars",
  "pitch": "New pitch text or omit to keep current - max 300 chars",
  "themes": ["Theme1", "Theme2"] or omit to keep current - only themes from the list,
  "partyLevelMin": number or omit to keep current,
  "partyLevelMax": number or omit to keep current,
  "playerCount": number or omit to keep current,
  "structureType": "act-based" or "branching" or "sandbox" or "decide-later" or omit to keep current,
  "coreConflict": "New core conflict text or omit to keep current - max 300 chars",
  "antagonistGoals": "New antagonist goals text or omit to keep current - max 300 chars"
}

CRITICAL JSON RULES:
- All property names in double quotes
- All string values in double quotes
- NO newlines inside strings - use spaces
- NO unescaped quotes or apostrophes
- Keep strings SHORT - title max 60 chars, pitch max 300 chars, explanation max 200 chars

WHEN TO PROPOSE:
- User asks for suggestions brainstorming or help with overview elements
- User wants to improve or refine their pitch title or themes
- User describes their adventure and you can extract details
- User asks about appropriate party level or player count
- User asks for help choosing a structure type
- User wants help defining the core conflict
- User asks for help with antagonist motivations or goals

BE PROACTIVE! If the user is asking for help with any overview element propose concrete suggestions.`

        const overviewResponse = await window.spark.llm(overviewPrompt, 'gpt-4o', true)
        
        console.log('Raw LLM response (overview):', overviewResponse.substring(0, 500))
        
        let overviewProposal
        try {
          overviewProposal = parseJsonSafely(overviewResponse)
        } catch (parseError) {
          console.error('Failed to parse overview response')
          console.error('Full response:', overviewResponse)
          console.error('Parse error:', parseError)
          throw new Error(`Invalid JSON in overview response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
        }

        if (overviewProposal.shouldPropose) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: overviewProposal.explanation,
            timestamp: Date.now(),
            overviewProposal: {
              title: overviewProposal.title,
              pitch: overviewProposal.pitch,
              themes: overviewProposal.themes,
              partyLevelMin: overviewProposal.partyLevelMin,
              partyLevelMax: overviewProposal.partyLevelMax,
              playerCount: overviewProposal.playerCount,
              structureType: overviewProposal.structureType,
              coreConflict: overviewProposal.coreConflict,
              antagonistGoals: overviewProposal.antagonistGoals,
              explanation: overviewProposal.explanation
            },
            overviewProposalStatus: 'pending'
          }
          setMessages((prev) => [...prev, assistantMessage])
        } else {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: overviewProposal.explanation,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMessage])
        }
        }
      } else if (adventure.stage === 'encounters') {
        // Load monster metadata
        let monsterMetadata: any = null
        try {
          const response = await fetch('/monsters-metadata.json')
          monsterMetadata = await response.json()
        } catch (error) {
          console.error('Failed to load monster metadata:', error)
        }

        const shouldProposeMonsters = monsterMetadata && (
          userMessage.content.toLowerCase().includes('monster') ||
          userMessage.content.toLowerCase().includes('creature') ||
          userMessage.content.toLowerCase().includes('enemy') ||
          userMessage.content.toLowerCase().includes('recommend') ||
          userMessage.content.toLowerCase().includes('suggest') ||
          userMessage.content.toLowerCase().includes('add') ||
          userMessage.content.toLowerCase().includes('balance')
        )

        if (shouldProposeMonsters) {
          // Determine target encounter and calculate budget
          const partyLevel = adventure.overview.partyLevelAverage
          const partySize = adventure.overview.playerCount
          
          // Find target encounter
          let targetEncounter: Encounter | undefined
          if (adventure.selectedEncounterId) {
            targetEncounter = adventure.structure.encounters.find(e => e.id === adventure.selectedEncounterId)
          }
          if (!targetEncounter) {
            targetEncounter = adventure.structure.encounters.find(e => 
              (e.type === 'combat' || e.type === 'chase') && 
              (!e.creatures || e.creatures.length === 0) && 
              (!e.npcs || e.npcs.length === 0)
            )
          }
          if (!targetEncounter) {
            targetEncounter = adventure.structure.encounters.find(e => e.type === 'combat' || e.type === 'chase')
          }
          
          if (!targetEncounter) {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: "I couldn't find a combat encounter to add monsters to. Please create a combat encounter first in the Structure stage.",
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, assistantMessage])
            return
          }
          
          // Calculate XP budget
          const difficulty = typeof targetEncounter.difficulty === 'string' 
            ? targetEncounter.difficulty as EncounterDifficulty
            : 'moderate' as EncounterDifficulty
          const budget = calculateXPBudget(partyLevel, partySize, difficulty)
          
          console.log(`Budget calculation: Party ${partySize} at level ${partyLevel}, difficulty ${difficulty} = ${budget} XP`)
          
          // Filter monsters using new system
          const allMonsters = monsterMetadata.monsters as MonsterMetadataType[]
          let filteredMonsters = filterMonsters(allMonsters, {
            budget,
            partyLevel,
            partySize,
            encounterType: targetEncounter.type
          })
          
          console.log(`Filtered ${filteredMonsters.length} suitable monsters from ${allMonsters.length} total`)

          // If we have too many monsters (>80), ask LLM to suggest keywords for user approval
          if (filteredMonsters.length > 80) {
            console.log('Too many monsters, asking LLM for keyword suggestions...')
            
            // Get available keywords from metadata
            const availableKeywords = monsterMetadata.theme_keywords || []
            
            const keywordSelectionPrompt = `You are helping select monsters for a D&D 5e encounter.

TARGET ENCOUNTER: "${targetEncounter.title}" (${targetEncounter.type}, ${difficulty} difficulty)
CONTEXT: ${targetEncounter.description || 'No description provided'}
USER REQUEST: ${userMessage.content}

AVAILABLE THEME KEYWORDS (choose from these ONLY):
${availableKeywords.join(', ')}

TASK: Select 3-5 theme keywords that best match this encounter. Choose keywords that would make sense for the monsters in this encounter based on the encounter's setting, theme, and user's request.

Return ONLY a valid JSON object with this structure:
{
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "reasoning": "Brief friendly explanation of why these themes fit this encounter"
}`

            try {
              console.log('Requesting keyword suggestions from LLM...')
              const keywordData = await window.spark.llm(keywordSelectionPrompt, 'gpt-4o', true)
              console.log('Keyword selection LLM response:', keywordData)
              const keywordJson = parseJsonSafely(keywordData) as any
              
              console.log('Parsed keyword JSON:', keywordJson)
              
              if (keywordJson && keywordJson.keywords && Array.isArray(keywordJson.keywords)) {
                console.log('✓ Valid keyword suggestion received:', keywordJson.keywords)
                
                // Store context for "go ahead" command
                pendingMonsterContextRef.current = {
                  filteredMonsters,
                  budget,
                  targetEncounter,
                  encounterContext: {
                    title: targetEncounter.title,
                    difficulty,
                    partyLevel,
                    partySize
                  },
                  keywords: keywordJson.keywords,
                  userRequest: userMessage.content
                }
                
                // Create keyword suggestion message for user approval
                const keywordMessage: Message = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: `I found ${filteredMonsters.length} possible monsters. To narrow this down, I suggest focusing on these themes:\n\n**${keywordJson.keywords.join(', ')}**\n\n${keywordJson.reasoning}\n\nSay "go ahead" and I'll suggest specific monsters for this encounter, or ask me to adjust the themes.`,
                  timestamp: Date.now(),
                  keywordSuggestion: {
                    keywords: keywordJson.keywords,
                    reasoning: keywordJson.reasoning,
                    userRequest: userMessage.content,
                    encounterContext: {
                      title: targetEncounter.title,
                      difficulty,
                      partyLevel,
                      partySize
                    }
                  },
                  keywordSuggestionStatus: 'pending'
                }
                
                setMessages((prev) => [...prev, keywordMessage])
                setIsLoading(false)
                return // Wait for user approval
              } else {
                console.warn('⚠ Invalid keyword JSON structure:', keywordJson)
              }
            } catch (error) {
              console.error('❌ Keyword selection failed, falling back to heuristic filtering:', error)
            }
          }

          // No fallback keyword filtering - if we have too many monsters and LLM didn't suggest keywords,
          // proceed with the full filtered list and let combo generation handle the selection

          // Final safety: if still too many monsters, ensure diverse CR distribution
          if (filteredMonsters.length > 80) {
            console.log(`Still ${filteredMonsters.length} monsters, selecting diverse CR range...`)
            
            // Group by CR to ensure variety
            const byCR = new Map<string, any[]>()
            filteredMonsters.forEach((m: any) => {
              if (!byCR.has(m.cr)) byCR.set(m.cr, [])
              byCR.get(m.cr)!.push(m)
            })
            
            // Take up to 8 monsters per CR (prioritizes variety)
            const diverseMonsters: any[] = []
            Array.from(byCR.values()).forEach(crGroup => {
              diverseMonsters.push(...crGroup.slice(0, 8))
            })
            
            filteredMonsters = diverseMonsters.slice(0, 80)
          }
          
          console.log(`Final filtered list: ${filteredMonsters.length} monsters`)
          
          // Generate valid combos
          const combos = generateCombos(filteredMonsters, {
            budget,
            partyLevel,
            partySize,
            targetXPMin: budget * 0.95,
            targetXPMax: budget * 1.05
          })
          
          console.log(`Generated ${combos.length} valid creature combinations`)
          
          // Format top 5 combos for LLM
          const top5Combos = combos.slice(0, 5)
          
          // Log the combos being offered
          console.log('Top 5 combos offered to AI:')
          top5Combos.forEach((combo, idx) => {
            const crPattern = combo.creatures.map(c => 
              `${c.count}× CR ${c.monster.cr}`
            ).join(', ')
            console.log(`  ${idx + 1}. [${crPattern}] = ${combo.totalXP} XP`)
          })
          
          const comboDescriptions = top5Combos.map((combo, idx) => {
            const stats = getComboStats(combo)
            // Extract CR pattern for the AI to follow exactly
            const crPattern = combo.creatures.map(c => {
              const count = c.count > 1 ? `${c.count}× ` : ''
              return `${count}CR ${c.monster.cr}`
            }).join(', ')
            
            return `Option ${idx + 1}: ${stats.description}
  - CR Pattern: [${crPattern}] ← USE THIS EXACT PATTERN
  - ${stats.totalXP} XP (${stats.percentOfBudget}% of budget)
  - ${stats.creatureCount} creatures (${stats.ratio} per PC), ${stats.statBlocks} stat blocks
  - Mix: ${stats.profile}${stats.warnings.length > 0 ? `\n  ⚠️ ${stats.warnings.join('; ')}` : ''}`
          }).join('\n\n')
          
          const monsterListSample = filteredMonsters
            .slice(0, 50) // Limit to 50 best options for context
            .map((monster: any) => 
              `- ${monster.file}: ${monster.name} (CR ${monster.cr}, ${monster.combat_role}, ${monster.creature_type})`
            ).join('\n')

          const monsterPrompt = llmPrompt`You are a helpful AI companion for D&D 5e encounter design.

IMPORTANT TONE GUIDELINES:
- Speak DIRECTLY to the user using you and we
- DO NOT refer to the user in third person
- Be friendly enthusiastic and direct

${stageContext}

User asked: ${userMessage.content}

TARGET ENCOUNTER: "${targetEncounter.title}" (${targetEncounter.type}, ${difficulty} difficulty)
- Party: ${partySize} level ${partyLevel} characters
- XP Budget: ${budget} XP
- Target Range: ${Math.round(budget * 0.95)}-${Math.round(budget * 1.05)} XP (95-105% of budget)

⚠️ DMG ENCOUNTER DESIGN GUIDELINES:
${partyLevel <= 2 ? '- LEVEL 1-2 PARTY: Max 2 creatures per PC (low-level characters are fragile!)' : '- Prefer ≤ 2 creatures per PC for smoother combat'}
- Use 1-3 different stat blocks (easier to run)
- Avoid massive hordes (slow combat, hard to manage)
- CR 0 creatures: Use sparingly (max 2-3 total)
- Creatures with CR > party level can one-shot characters
- Bias toward FEWER creatures for faster, more dynamic combat

PRE-CALCULATED VALID COMBINATIONS:
These combinations are ALREADY VERIFIED to fit the budget perfectly. 
🚨 CRITICAL: You MUST pick monsters that match one of these CR combinations EXACTLY. 🚨

${comboDescriptions}

HOW TO USE THESE COMBOS (MANDATORY PROCESS):
1. Pick ONE combo option from above (e.g., Option 2)
2. Look at the CR Pattern (e.g., [2× CR 6, 1× CR 7])
3. From the monster library below, find monsters with those EXACT CRs:
   - Find 2 different CR 6 monsters that fit the theme
   - Find 1 CR 7 monster that fits the theme
4. Your "monsters" array must have exactly 2 entries with cr:"6" and 1 entry with cr:"7"
5. DO NOT substitute different CRs (e.g., don't use CR 8 if the pattern says CR 7)

WORKED EXAMPLE:
If Option 1 is "[2× CR 5, 1× CR 6]", you might respond:
{
  "monsters": [
    {"filename": "...", "name": "Orc", "cr": "5", "count": 1, ...},
    {"filename": "...", "name": "Bugbear", "cr": "5", "count": 1, ...},
    {"filename": "...", "name": "Ogre", "cr": "6", "count": 1, ...}
  ]
}
Note: Two different CR 5 monsters, one CR 6 monster.

FILTERED MONSTER LIBRARY (${filteredMonsters.length} suitable options, CR 0-${partyLevel + 4}):
NOTE: Low CR creatures (even CR 0-2) are included for thematic elite+minions pairings. 
The pre-calculated combos balance them appropriately with higher CR bosses.
${monsterListSample}

TASK: Determine if you should recommend specific monsters for an encounter.

When to recommend monsters:
- User asks for monster suggestions or recommendations
- User wants to balance an encounter
- User describes an encounter and wants appropriate enemies
- User asks what creatures would fit a theme or location

Return ONLY valid JSON with NO text before or after:
{
  "shouldPropose": true or false,
  "encounterId": "${targetEncounter.id}",
  "explanation": "Brief explanation under 200 chars using you and we",
  "monsters": [
    {
      "filename": "exact-filename-from-library",
      "name": "Monster Name",
      "cr": "CR value",
      "role": "combat role",
      "count": number-of-this-monster,
      "reasoning": "Why this monster fits - under 100 chars"
    }
  ],
  "reasoning": "Overall explanation of the encounter composition - under 200 chars",
  "totalXP": number - CRITICAL: Sum of (each monster's CR XP × count). Example: 2 CR 8 monsters = 2 × 3900 = 7800 XP. MUST total ${Math.round(budget * 0.95)}-${Math.round(budget * 1.05)} XP,
  "budgetXP": ${budget}
}

CRITICAL JSON RULES:
- MUST match a CR pattern from the pre-calculated combos EXACTLY
- Example: If combo says "2× CR 6, 1× CR 7", your monsters array must have exactly two CR 6 monsters and one CR 7 monster
- All property names in double quotes
- All string values in double quotes  
- NO newlines inside strings - use spaces
- Keep strings SHORT
- Use EXACT filenames from the monster library
- Prefer 1-4 creatures total (avoid hordes)
- Use 1-3 different stat blocks
- Mix roles for interesting combat
- MUST: totalXP between ${Math.round(budget * 0.95)} and ${Math.round(budget * 1.05)}`

          const monsterResponse = await window.spark.llm(monsterPrompt, 'gpt-4o', true)
          
          console.log('Raw LLM response (monsters):', monsterResponse.substring(0, 500))
          
          let monsterProposal
          try {
            monsterProposal = parseJsonSafely(monsterResponse)
          } catch (parseError) {
            console.error('Failed to parse monster response')
            console.error('Full response:', monsterResponse)
            console.error('Parse error:', parseError)
            throw new Error(`Invalid JSON in monster response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
          }

          if (monsterProposal.shouldPropose && monsterProposal.monsters?.length > 0) {
            // Validate the proposal - recalculate totalXP to catch AI errors
            const calculatedTotalXP = monsterProposal.monsters.reduce((sum: number, m: any) => {
              const xp = crToXP(m.cr)
              return sum + (xp * m.count)
            }, 0)
            
            // Use calculated XP instead of AI-provided XP
            const totalXP = calculatedTotalXP
            console.log(`AI reported ${monsterProposal.totalXP} XP, actual calculation: ${calculatedTotalXP} XP`)
            
            const totalCreatures = monsterProposal.monsters.reduce((sum: number, m: any) => sum + m.count, 0)
            const statBlockCount = monsterProposal.monsters.length
            const ratio = totalCreatures / partySize
            
            const warnings: string[] = []
            const errors: string[] = []
            
            // Budget validation
            if (totalXP < budget * 0.95 || totalXP > budget * 1.05) {
              // Show which monsters were chosen to help debug
              const chosenCRs = monsterProposal.monsters.map((m: any) => 
                `${m.count}× CR ${m.cr}`
              ).join(', ')
              errors.push(`XP ${totalXP} is outside valid range ${Math.round(budget * 0.95)}-${Math.round(budget * 1.05)}. Chosen: [${chosenCRs}]. Must use pre-calculated combo CR patterns exactly`)
            }
            
            // Creature count validation
            if (partyLevel <= 2 && ratio > 2) {
              errors.push(`Too many creatures for level ${partyLevel} party (${totalCreatures} for ${partySize} PCs)`)
            } else if (ratio > 2.5) {
              warnings.push(`High creature count (${totalCreatures}) - ensure they are fragile`)
            }
            
            // Stat block validation
            if (statBlockCount > 3) {
              warnings.push(`${statBlockCount} stat blocks may be complex to run`)
            }
            
            // Dangerous creature check
            monsterProposal.monsters.forEach((m: any) => {
              const cr = parseCR(m.cr)
              if (cr > partyLevel) {
                warnings.push(`${m.name} (CR ${m.cr}) may one-shot characters`)
              }
            })
            
            // CR 0 check
            const cr0Count = monsterProposal.monsters
              .filter((m: any) => m.cr === '0')
              .reduce((sum: number, m: any) => sum + m.count, 0)
            if (cr0Count > 3) {
              warnings.push(`${cr0Count} CR 0 creatures - consider using swarms instead`)
            }
            
            if (errors.length > 0) {
              console.error('Proposal validation errors:', errors)
              const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `I had trouble creating a balanced encounter: ${errors.join('; ')}. Let me try again with different creatures.`,
                timestamp: Date.now(),
              }
              setMessages((prev) => [...prev, assistantMessage])
              return
            }
            
            const encounterId = targetEncounter.id
            const encounter = targetEncounter
            
            // Add warnings to the proposal explanation
            let finalExplanation = monsterProposal.explanation
            if (warnings.length > 0) {
              finalExplanation += `\n\n⚠️ Note: ${warnings.join('; ')}`
            }
            
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: finalExplanation,
              timestamp: Date.now(),
              monsterProposal: {
                encounterId: encounterId,
                encounterTitle: encounter.title,
                monsters: monsterProposal.monsters,
                explanation: finalExplanation,
                reasoning: monsterProposal.reasoning,
                totalXP: totalXP, // Use corrected calculated value
                budgetXP: monsterProposal.budgetXP
              },
              monsterProposalStatus: 'pending'
            }
            setMessages((prev) => [...prev, assistantMessage])
          } else {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: monsterProposal.explanation,
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, assistantMessage])
          }
        } else {
          const generalPrompt = llmPrompt`You are a helpful AI companion assisting with encounter design for D&D 5e. Speak directly to the user using you and we. NEVER refer to the user in third person. Be friendly and collaborative.

${stageContext}

User: ${userMessage.content}

Respond helpfully and concisely using direct language.`
          const response = await window.spark.llm(generalPrompt, 'gpt-4o-mini')

          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response,
            timestamp: Date.now(),
          }

          setMessages((prev) => [...prev, assistantMessage])
        }
      } else if (adventure.stage === 'npcs') {
        // NPC creation logic
        const shouldProposeNPCs = 
          userMessage.content.toLowerCase().includes('create') ||
          userMessage.content.toLowerCase().includes('add') ||
          userMessage.content.toLowerCase().includes('npc') ||
          userMessage.content.toLowerCase().includes('character') ||
          userMessage.content.toLowerCase().includes('suggest') ||
          userMessage.content.toLowerCase().includes('generate') ||
          userMessage.content.toLowerCase().includes('antagonist')

        if (shouldProposeNPCs) {
          console.log('User may be requesting NPC creation, generating proposal...')

          // Load monster metadata for creature assignment suggestions
          let monsterMetadata: any = null
          try {
            const response = await fetch('/monsters-metadata.json')
            monsterMetadata = await response.json()
          } catch (error) {
            console.error('Failed to load monster metadata:', error)
          }

          const monsterContext = monsterMetadata ? `
MONSTER LIBRARY ACCESS:
You have access to a comprehensive library of 500+ D&D 5e creatures for NPC stat blocks.
Available creature types: aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant, undead
CR range: 0 to 30
Combat roles: striker, tank, controller, support, skirmisher, artillery, infiltrator

When the user requests NPCs who might be antagonists, combatants, or need combat stats, you can suggest an appropriate creature from the library by including a "creatureFile" field. For example:
- A bugbear chieftain might use "4831002-bugbear-warrior.html" 
- A cult leader might use "4904746-cultist-fanatic.html"
- A noble knight might use "4904816-knight.html"

Available humanoid options include: berserker, cultist, cultist-fanatic, knight, mage, pirate, pirate-captain, etc.
DO NOT include creatureFile unless the NPC clearly needs combat stats (antagonists, guards, enemies, etc.).
` : ''

          const npcPrompt = llmPrompt`You are an AI assistant helping create NPCs for a D&D 5e adventure. 

${stageContext}

The user has requested: "${userMessage.content}"

${monsterContext}

Your task is to propose one or more NPCs based on the user's request. Infer any missing details creatively but appropriately for a D&D fantasy setting.

CRITICAL RULES FOR APPEARANCE:
The "appearance" field MUST include:
1. Race/species (human, elf, dwarf, tiefling, dragonborn, halfling, gnome, orc, etc.)
2. Gender (male, female, non-binary)
3. Physical details (age, build, height, distinctive features, clothing, style)

Example: "A young adult male tiefling with crimson skin, curved ram horns, and golden eyes. He has a lean, athletic build and wears fine merchant's clothes with subtle arcane sigils embroidered along the collar. A silver pendant hangs around his neck."

RESPONSE FORMAT (JSON only, no markdown):
{
  "shouldPropose": true/false,
  "npcs": [
    {
      "name": "Character name",
      "role": "Their role in the adventure (e.g., Quest Giver, Merchant, Villain, Ally, Antagonist, etc.)",
      "appearance": "DETAILED appearance including race, gender, and physical description",
      "personality": "Personality traits, mannerisms, speaking style",
      "secrets": ["Optional secret 1", "Optional secret 2"],
      "creatureFile": "Optional - only for NPCs who need combat stats (e.g., 4904636-cultist.html)"
    }
  ],
  "explanation": "Brief explanation of the proposed NPCs and how they fit the request"
}

If the user is just asking questions or not requesting NPC creation, set shouldPropose to false and provide a helpful explanation.
If creating NPCs, ensure each has a complete, detailed appearance description.
Keep responses concise and focused.`

          const npcResponse = await window.spark.llm(npcPrompt, 'gpt-4o', true)
          console.log('NPC LLM response:', npcResponse)

          let npcProposal: any
          try {
            npcProposal = parseJsonSafely(npcResponse)
          } catch (parseError) {
            console.error('Failed to parse NPC response')
            console.error('Full response:', npcResponse)
            console.error('Parse error:', parseError)
            throw new Error(`Invalid JSON in NPC response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
          }

          if (npcProposal.shouldPropose && npcProposal.npcs?.length > 0) {
            // Validate that each NPC has required appearance details
            const validationErrors: string[] = []
            npcProposal.npcs.forEach((npc: any, idx: number) => {
              const appearance = (npc.appearance || '').toLowerCase()
              
              // Check for race/species keywords
              const hasRace = /\b(human|elf|dwarf|halfling|gnome|dragonborn|tiefling|half-elf|half-orc|orc|goblin|kobold|yuan-ti|tabaxi|kenku|aarakocra|genasi|aasimar|firbolg|goliath|lizardfolk|triton|tortle|changeling|kalashtar|shifter|warforged)\b/i.test(appearance)
              
              // Check for gender keywords
              const hasGender = /\b(male|female|man|woman|boy|girl|non-binary|androgynous)\b/i.test(appearance)
              
              if (!hasRace) {
                validationErrors.push(`NPC "${npc.name}" is missing race/species in appearance`)
              }
              if (!hasGender) {
                validationErrors.push(`NPC "${npc.name}" is missing gender in appearance`)
              }
              if (appearance.length < 50) {
                validationErrors.push(`NPC "${npc.name}" has too brief appearance description`)
              }
            })

            if (validationErrors.length > 0) {
              console.warn('NPC validation errors:', validationErrors)
              const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `I generated NPC proposals, but they need more detail:\n\n${validationErrors.join('\n')}\n\nLet me refine the descriptions...`,
                timestamp: Date.now(),
              }
              setMessages((prev) => [...prev, assistantMessage])
            } else {
              // Valid NPC proposal
              const npcList = npcProposal.npcs.map((npc: any, idx: number) => 
                `${idx + 1}. **${npc.name}** - ${npc.role}`
              ).join('\n')

              const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `I've created ${npcProposal.npcs.length} NPC${npcProposal.npcs.length > 1 ? 's' : ''} for your adventure:\n\n${npcList}\n\n${npcProposal.explanation}\n\nWould you like to add ${npcProposal.npcs.length > 1 ? 'these' : 'this'} to your adventure?`,
                timestamp: Date.now(),
                npcProposal: {
                  npcs: npcProposal.npcs,
                  explanation: npcProposal.explanation
                },
                npcProposalStatus: 'pending'
              }
              setMessages((prev) => [...prev, assistantMessage])
            }
          } else {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: npcProposal.explanation,
              timestamp: Date.now(),
            }
            setMessages((prev) => [...prev, assistantMessage])
          }
        } else {
          const generalPrompt = llmPrompt`You are a helpful AI companion assisting with NPC creation for D&D 5e adventures. Speak directly to the user using you and we. NEVER refer to the user in third person. Be friendly and collaborative.

${stageContext}

User: ${userMessage.content}

Respond helpfully and concisely using direct language.`
          const response = await window.spark.llm(generalPrompt, 'gpt-4o-mini')

          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response,
            timestamp: Date.now(),
          }

          setMessages((prev) => [...prev, assistantMessage])
        }
      } else {
        const generalPrompt = llmPrompt`You are a helpful AI companion assisting with tabletop RPG adventure creation. Speak directly to the user using you and we. NEVER refer to the user in third person. Be friendly and collaborative.

Current stage: ${adventure.stage}

${stageContext}

User: ${userMessage.content}

Respond helpfully and concisely using direct language.`
        const response = await window.spark.llm(generalPrompt, 'gpt-4o-mini')

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        }

        setMessages((prev) => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('AI error:', error)
      
      let errorMessage = 'I apologize, but I encountered an error. '
      
      if (error instanceof Error) {
        errorMessage += `\n\n**Error Details:**\n${error.message}`
        
        if (error.message.includes('JSON')) {
          errorMessage += '\n\n**Likely cause:** The AI response was not valid JSON. This can happen if the AI generated text instead of structured data.'
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage += '\n\n**Likely cause:** Network connectivity issue. Please check your connection and try again.'
        } else if (error.message.includes('timeout')) {
          errorMessage += '\n\n**Likely cause:** The request took too long. Try simplifying your request or try again.'
        } else if (error.message.includes('rate limit')) {
          errorMessage += '\n\n**Likely cause:** Too many requests. Please wait a moment and try again.'
        }
        
        if (error.stack) {
          console.error('Full error stack:', error.stack)
          errorMessage += `\n\n**Technical details logged to console** - Open developer tools (F12) to see the full error stack.`
        }
      } else {
        errorMessage += `\n\n**Unknown error type:** ${String(error)}`
      }
      
      errorMessage += '\n\n**What you can try:**\n• Rephrase your request more simply\n• Try again in a moment\n• Check the browser console (F12) for technical details\n• Refresh the page if the problem persists'
      
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: errorMessage,
          timestamp: Date.now(),
        },
      ])
      
      toast.error('AI request failed - see details in chat')
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickAction = async (action: string) => {
    setInput(action)
    setTimeout(sendMessage, 100)
  }

  const handleAcceptProposal = (messageId: string) => {
    const message = messages.find(m => m.id === messageId)
    if (!message?.proposal) return

    const proposal = message.proposal

    const tempIdToRealId: Record<string, string> = {}

    // Map old beat types to new encounter types
    const typeMap: Record<string, Encounter['type']> = {
      'social-encounter': 'social',
      'investigation': 'investigation',
      'combat': 'combat',
      'skill-challenge': 'skill-challenge',
      'exploration': 'survival',  // Map exploration to survival
      'puzzle': 'puzzle',
      'rest': 'social',  // Map rest to social
      'climax': 'combat',  // Map climax to combat
      'location': 'investigation',  // Map location to investigation
      'scene': 'social',  // Map scene to social
      'beat': 'social',  // Map beat to social
      'social': 'social',
      'hazard': 'hazard',
      'chase': 'chase',
      'survival': 'survival'
    }

    const newEncounters: Encounter[] = proposal.cards.map(card => {
      const realId = crypto.randomUUID()
      tempIdToRealId[card.tempId] = realId
      
      const clampedPosition = clampPositionToBounds(card.position.x, card.position.y)
      
      return {
        id: realId,
        title: card.title,
        description: card.description,
        type: typeMap[card.type] || 'combat',
        linkedFactions: [],
        linkedLocations: [],
        position: clampedPosition,
        difficulty: 5,
        creatures: [],
        npcs: [],
        stakes: '',
        consequences: '',
        rewardIds: [],
        importantChecks: []
      }
    })

    const editedEncounters = adventure.structure.encounters.map(encounter => {
      const edit = proposal.edits?.find(e => e.encounterId === encounter.id)
      if (edit) {
        return {
          ...encounter,
          title: edit.newTitle,
          description: edit.newDescription
        }
      }
      return encounter
    })

    const newConnections = (proposal.connections || []).map(conn => ({
      from: tempIdToRealId[conn.from] || conn.from,
      to: tempIdToRealId[conn.to] || conn.to,
      fromSide: conn.fromSide,
      toSide: conn.toSide
    }))

    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: [...editedEncounters, ...newEncounters],
        connections: [...adventure.structure.connections, ...newConnections]
      }
    })

    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, proposalStatus: 'accepted' as const }
        : m
    ))

    celebrateCardAddition()

    const addCount = proposal.cards.length
    const editCount = proposal.edits?.length || 0
    const connCount = newConnections.length

    let toastMessage = ''
    if (addCount > 0 && editCount > 0) {
      toastMessage = `Added ${addCount} card(s) and edited ${editCount} card(s)!`
    } else if (addCount > 0) {
      toastMessage = `Added ${addCount} card(s)${connCount > 0 ? ` with ${connCount} connection(s)` : ''}!`
    } else if (editCount > 0) {
      toastMessage = `Edited ${editCount} card(s)!`
    }

    if (toastMessage) {
      toast.success(toastMessage)
    }
  }

  const handleRejectProposal = (messageId: string) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, proposalStatus: 'rejected' as const }
        : m
    ))

    toast.info('Proposal rejected')
  }

  const handleAcceptOverviewProposal = (messageId: string) => {
    const message = messages.find(m => m.id === messageId)
    if (!message?.overviewProposal) return

    const proposal = message.overviewProposal
    const updates: Partial<Adventure> = {}

    if (proposal.title !== undefined) {
      updates.name = proposal.title
    }

    const overviewUpdates: Partial<typeof adventure.overview> = {}
    if (proposal.pitch !== undefined) overviewUpdates.pitch = proposal.pitch
    if (proposal.themes !== undefined) overviewUpdates.themes = proposal.themes
    if (proposal.playerCount !== undefined) overviewUpdates.playerCount = proposal.playerCount
    if (proposal.coreConflict !== undefined) overviewUpdates.coreConflict = proposal.coreConflict
    if (proposal.antagonistGoals !== undefined) overviewUpdates.antagonistGoals = proposal.antagonistGoals

    if (Object.keys(overviewUpdates).length > 0) {
      updates.overview = { ...adventure.overview, ...overviewUpdates }
    }

    updateAdventure(updates)

    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, overviewProposalStatus: 'accepted' as const }
        : m
    ))

    celebrateCardAddition()

    const changedItems: string[] = []
    if (proposal.title) changedItems.push('title')
    if (proposal.pitch) changedItems.push('pitch')
    if (proposal.themes) changedItems.push('themes')
    if (proposal.partyLevelMin || proposal.partyLevelMax) changedItems.push('party level')
    if (proposal.playerCount) changedItems.push('player count')
    if (proposal.structureType) changedItems.push('structure type')
    if (proposal.coreConflict) changedItems.push('core conflict')
    if (proposal.antagonistGoals) changedItems.push('antagonist goals')

    toast.success(`Updated ${changedItems.join(', ')}!`)
  }

  const handleRejectOverviewProposal = (messageId: string) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, overviewProposalStatus: 'rejected' as const }
        : m
    ))

    toast.info('Proposal rejected')
  }

  const handleAcceptMonsterProposal = async (messageId: string) => {
    console.log('handleAcceptMonsterProposal called with messageId:', messageId)
    const message = messages.find(m => m.id === messageId)
    if (!message?.monsterProposal) {
      console.error('No monster proposal found for message:', messageId)
      return
    }

    const proposal = message.monsterProposal
    console.log('Monster proposal:', proposal)
    
    try {
      // Load monster metadata to get full creature info
      console.log('Loading monster metadata...')
      const response = await fetch('/monsters-metadata.json')
      const metadata = await response.json()
      const monsterList = metadata.monsters as any[]
      
      // Create creature references from metadata
      const creatureReferences: any[] = []

      for (const proposedMonster of proposal.monsters) {
        // Find the monster in metadata by filename
        const monsterData = monsterList.find(m => m.file === proposedMonster.filename)
        
        if (!monsterData) {
          console.error(`Monster not found in metadata: ${proposedMonster.filename}`)
          continue
        }
        
        console.log(`Creating creature from metadata: ${monsterData.name}`)
        
        // Create a lightweight creature object from metadata with lazy loading support
        const creature: any = {
          size: 'Medium', // Default, will be loaded from HTML
          type: monsterData.creature_type || 'Unknown',
          alignment: 'Unaligned', // Default, will be loaded from HTML
          ac: 10, // Default, will be loaded from HTML
          hp: '1d8', // Default, will be loaded from HTML
          speed: '30 ft.', // Default, will be loaded from HTML
          abilityScores: {
            str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10
          },
          cr: monsterData.cr,
          // Store metadata for display and lazy loading
          _metadata: {
            htmlFile: monsterData.file,
            role: monsterData.combat_role,
            summary: monsterData.summary,
            keywords: monsterData.theme_keywords
          }
        }
        
        // Create multiple instances if count > 1
        for (let i = 0; i < proposedMonster.count; i++) {
          const creatureRef = {
            id: crypto.randomUUID(),
            name: proposedMonster.count > 1 ? `${monsterData.name} ${i + 1}` : monsterData.name,
            creature
          }
          creatureReferences.push(creatureRef)
        }
      }
      
      console.log(`Created ${creatureReferences.length} creature references`)
      
      // Check if we successfully parsed any creatures
      if (creatureReferences.length === 0) {
        toast.error('Failed to parse monster data')
        return
      }

      // Add creatures to the encounter
      console.log(`Adding creatures to encounter: ${proposal.encounterId}`)
      const encounter = adventure.structure.encounters.find(e => e.id === proposal.encounterId)
      if (encounter) {
        console.log(`Found encounter: ${encounter.title}`)
        const updatedEncounters = adventure.structure.encounters.map(enc => {
          if (enc.id === proposal.encounterId) {
            return {
              ...enc,
              creatures: [...(enc.creatures || []), ...creatureReferences.map(c => c.id)]
            }
          }
          return enc
        })

        console.log('Updating adventure with new encounters...')
        updateAdventure({
          structure: {
            ...adventure.structure,
            encounters: updatedEncounters
          }
        })

        // Store creature references globally
        console.log('Storing creature references globally...')
        ;(window as any).creatureReferences = [
          ...((window as any).creatureReferences || []),
          ...creatureReferences
        ]

        console.log('Updating message status...')
        setMessages(prev => prev.map(m => 
          m.id === messageId 
            ? { ...m, monsterProposalStatus: 'accepted' as const }
            : m
        ))

        celebrateCardAddition()

        const totalCreatures = creatureReferences.length
        toast.success(`Added ${totalCreatures} creature${totalCreatures > 1 ? 's' : ''} to ${proposal.encounterTitle}!`)
        console.log('Monster proposal accepted successfully!')
      } else {
        console.error('Could not find encounter with ID:', proposal.encounterId)
        toast.error('Could not find the encounter to add monsters to')
      }
    } catch (error) {
      console.error('Error accepting monster proposal:', error)
      toast.error('Failed to add monsters to encounter')
    }
  }

  const handleRejectMonsterProposal = (messageId: string) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, monsterProposalStatus: 'rejected' as const }
        : m
    ))

    toast.info('Monster proposal rejected')
  }

  const handleAcceptKeywordSuggestion = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId)
    if (!message?.keywordSuggestion) return

    // Mark as accepted
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, keywordSuggestionStatus: 'accepted' as const }
        : m
    ))

    setIsLoading(true)
    
    console.log('Themes accepted - filtering monsters...')

    // Load monster metadata and proceed with filtering
    try {
      const response = await fetch('/monsters-metadata.json')
      const monsterMetadata = await response.json()
      const allMonsters = monsterMetadata.monsters as MonsterMetadataType[]
      
      const { encounterContext, keywords } = message.keywordSuggestion
      
      // Find the target encounter
      let targetEncounter = adventure.structure.encounters.find(e => 
        e.title === encounterContext.title
      )
      if (!targetEncounter && adventure.selectedEncounterId) {
        targetEncounter = adventure.structure.encounters.find(e => 
          e.id === adventure.selectedEncounterId
        )
      }
      
      if (!targetEncounter) {
        toast.error('Could not find the encounter')
        setIsLoading(false)
        return
      }

      // Recreate the filtering from where we left off
      const budget = calculateXPBudget(
        encounterContext.partyLevel, 
        encounterContext.partySize, 
        encounterContext.difficulty as EncounterDifficulty
      )
      
      let filteredMonsters = filterMonsters(allMonsters, {
        budget,
        partyLevel: encounterContext.partyLevel,
        partySize: encounterContext.partySize,
        encounterType: targetEncounter.type
      })

      console.log(`Applying approved keywords: ${keywords.join(', ')}`)
      
      // Apply keyword filtering - monsters ranked by number of keyword matches
      const scoredMonsters = filteredMonsters.map((monster: any) => {
        const monsterKeywords = (monster.theme_keywords || []).map((k: string) => k.toLowerCase())
        let matchCount = 0
        let matchedKeywords: string[] = []
        
        keywords.forEach(keyword => {
          const kw = keyword.toLowerCase()
          if (monsterKeywords.includes(kw)) {
            matchedKeywords.push(keyword)
            matchCount++
          }
        })
        
        return { monster, matchCount, matchedKeywords }
      })
      
      // Sort by match count (highest first: 3 matches > 2 matches > 1 match)
      // Only include monsters with at least 1 keyword match
      const keywordFiltered = scoredMonsters
        .filter(item => item.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount)
        .map(item => item.monster)
      
      console.log(`Keyword filtering: ${filteredMonsters.length} → ${keywordFiltered.length} monsters`)
      console.log(`Match distribution: ${scoredMonsters.filter(s => s.matchCount === 3).length} with 3 matches, ${scoredMonsters.filter(s => s.matchCount === 2).length} with 2, ${scoredMonsters.filter(s => s.matchCount === 1).length} with 1`)
      
      if (keywordFiltered.length >= 10) {
        filteredMonsters = keywordFiltered.slice(0, 80)
      } else if (keywordFiltered.length > 0) {
        console.warn('Keyword filtering produced few results, keeping top matches')
        filteredMonsters = keywordFiltered
      }

      // Apply final diversity filter if needed
      if (filteredMonsters.length > 80) {
        const byCR = new Map<string, any[]>()
        filteredMonsters.forEach((m: any) => {
          if (!byCR.has(m.cr)) byCR.set(m.cr, [])
          byCR.get(m.cr)!.push(m)
        })
        
        const diverseMonsters: any[] = []
        Array.from(byCR.values()).forEach(crGroup => {
          diverseMonsters.push(...crGroup.slice(0, 8))
        })
        
        filteredMonsters = diverseMonsters.slice(0, 80)
      }

      console.log(`Final filtered list: ${filteredMonsters.length} monsters`)

      // Add acknowledgment message
      const confirmMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Great! I've filtered ${filteredMonsters.length} monsters matching these themes: **${keywords.join(', ')}**\n\nLet me suggest specific monsters now...`,
        timestamp: Date.now()
      }
      
      setMessages((prev) => [...prev, confirmMessage])

      // Proceed immediately with monster suggestions
      console.log('Proceeding with monster suggestions...')
      await continueMonsterSuggestion(
        filteredMonsters,
        budget,
        targetEncounter,
        encounterContext,
        message
      )
      
    } catch (error) {
      console.error('Error processing keyword suggestion:', error)
      toast.error('Failed to filter monsters')
      setIsLoading(false)
    }
  }

  const handleRejectKeywordSuggestion = (messageId: string) => {
    // Clear any pending monster context
    pendingMonsterContextRef.current = null
    
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, keywordSuggestionStatus: 'rejected' as const }
        : m
    ))

    toast.info('Keyword suggestion rejected - try describing your needs differently')
  }

  const handleAcceptNPCProposal = async (messageId: string) => {
    const message = messages.find(m => m.id === messageId)
    if (!message?.npcProposal) return

    const proposal = message.npcProposal
    const isAntagonist = (proposal as any).isAntagonist || false
    
    // Load monster metadata if any NPCs have creature files
    let monsterMetadata: any = null
    const hasCreatureFiles = proposal.npcs.some((npc: any) => npc.creatureFile)
    
    if (hasCreatureFiles) {
      try {
        const response = await fetch('/monsters-metadata.json')
        monsterMetadata = await response.json()
      } catch (error) {
        console.error('Failed to load monster metadata:', error)
      }
    }

    // Create NPCs from proposal
    const newNPCs: NPC[] = []
    const newAntagonistIds: string[] = []
    
    for (const proposedNPC of proposal.npcs) {
      const npcId = crypto.randomUUID()
      const npc: NPC = {
        id: npcId,
        name: proposedNPC.name,
        role: proposedNPC.role,
        appearance: proposedNPC.appearance,
        personality: proposedNPC.personality,
        secrets: proposedNPC.secrets || [],
        relationships: []
      }

      // If this NPC has a creature file, load the creature stats
      if (proposedNPC.creatureFile && monsterMetadata) {
        const monsterList = monsterMetadata.monsters as any[]
        const monsterData = monsterList.find((m: any) => m.file === proposedNPC.creatureFile)
        
        if (monsterData) {
          console.log(`Loading creature stats for ${proposedNPC.name} from ${proposedNPC.creatureFile}`)
          
          // Create a lightweight creature object from metadata
          npc.creature = {
            size: 'Medium',
            type: monsterData.creature_type || 'Humanoid',
            alignment: 'Unaligned',
            ac: 10,
            hp: '1d8',
            speed: '30 ft.',
            abilityScores: {
              str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10
            },
            cr: monsterData.cr,
            _metadata: {
              htmlFile: monsterData.file,
              role: monsterData.combat_role,
              summary: monsterData.summary,
              keywords: monsterData.theme_keywords
            }
          } as any
        }
      }

      newNPCs.push(npc)
      
      // Track antagonist IDs
      if (isAntagonist) {
        newAntagonistIds.push(npcId)
      }
    }

    // Update adventure with new NPCs
    const updates: Partial<Adventure> = {
      npcs: [...adventure.npcs, ...newNPCs]
    }

    // If this is an antagonist, also update the antagonist IDs in overview
    if (isAntagonist && newAntagonistIds.length > 0) {
      updates.overview = {
        ...adventure.overview,
        antagonistIds: [...(adventure.overview.antagonistIds || []), ...newAntagonistIds]
      }
    }

    updateAdventure(updates)

    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, npcProposalStatus: 'accepted' as const }
        : m
    ))

    celebrateCardAddition()

    const message_text = isAntagonist 
      ? `Added ${newNPCs[0].name} as antagonist!`
      : `Added ${newNPCs.length} NPC${newNPCs.length > 1 ? 's' : ''} to your adventure!`
    
    toast.success(message_text)
  }

  const handleRejectNPCProposal = (messageId: string) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId 
        ? { ...m, npcProposalStatus: 'rejected' as const }
        : m
    ))

    toast.info('NPC proposal rejected')
  }

  // Helper function to continue monster suggestion after keyword approval
  const continueMonsterSuggestion = async (
    filteredMonsters: any[],
    budget: number,
    targetEncounter: Encounter,
    encounterContext: { partyLevel: number, partySize: number, difficulty: string },
    keywordMessage: Message
  ) => {
    try {
      const combos = generateCombos(filteredMonsters, {
        budget,
        partyLevel: encounterContext.partyLevel,
        partySize: encounterContext.partySize,
        targetXPMin: budget * 0.95,
        targetXPMax: budget * 1.05
      })
      
      console.log(`Generated ${combos.length} valid creature combinations`)
      
      const top5Combos = combos.slice(0, 5)
      
      console.log('Top 5 combos offered to AI:')
      top5Combos.forEach((combo, idx) => {
        const crPattern = combo.creatures.map(c => 
          `${c.count}× CR ${c.monster.cr}`
        ).join(', ')
        console.log(`  ${idx + 1}. [${crPattern}] = ${combo.totalXP} XP`)
      })
      
      const comboDescriptions = top5Combos.map((combo, idx) => {
        const stats = getComboStats(combo)
        const crPattern = combo.creatures.map(c => {
          const count = c.count > 1 ? `${c.count}× ` : ''
          return `${count}CR ${c.monster.cr}`
        }).join(', ')
        
        return `Option ${idx + 1}: ${stats.description}
  - CR Pattern: [${crPattern}] ← USE THIS EXACT PATTERN
  - ${stats.totalXP} XP (${stats.percentOfBudget}% of budget)
  - ${stats.creatureCount} creatures (${stats.ratio} per PC), ${stats.statBlocks} stat blocks
  - Mix: ${stats.profile}${stats.warnings.length > 0 ? `\n  ⚠️ ${stats.warnings.join('; ')}` : ''}`
      }).join('\n\n')
      
      const monsterListSample = filteredMonsters
        .slice(0, 50)
        .map((monster: any) => 
          `- ${monster.file}: ${monster.name} (CR ${monster.cr}, ${monster.combat_role}, ${monster.creature_type})`
        ).join('\n')

      // Get the original user request from keyword suggestion
      const userRequest = keywordMessage.keywordSuggestion?.userRequest || 'Suggest monsters'

      const stageContext = buildStageContext(adventure)
      const difficulty = encounterContext.difficulty

      const monsterPrompt = `You are a helpful AI companion for D&D 5e encounter design.

IMPORTANT TONE GUIDELINES:
- Speak DIRECTLY to the user using you and we
- DO NOT refer to the user in third person
- Be friendly enthusiastic and direct

${stageContext}

User asked: ${userRequest}

TARGET ENCOUNTER: "${targetEncounter.title}" (${targetEncounter.type}, ${difficulty} difficulty)
- Party: ${encounterContext.partySize} level ${encounterContext.partyLevel} characters
- XP Budget: ${budget} XP
- Target Range: ${Math.round(budget * 0.95)}-${Math.round(budget * 1.05)} XP (95-105% of budget)

⚠️ DMG ENCOUNTER DESIGN GUIDELINES:
${encounterContext.partyLevel <= 2 ? '- LEVEL 1-2 PARTY: Max 2 creatures per PC (low-level characters are fragile!)' : '- Prefer ≤ 2 creatures per PC for smoother combat'}
- Use 1-3 different stat blocks (easier to run)
- Avoid massive hordes (slow combat, hard to manage)
- CR 0 creatures: Use sparingly (max 2-3 total)
- Creatures with CR > party level can one-shot characters
- Bias toward FEWER creatures for faster, more dynamic combat

PRE-CALCULATED VALID COMBINATIONS:
These combinations are ALREADY VERIFIED to fit the budget perfectly. 
🚨 CRITICAL: You MUST pick monsters that match one of these CR combinations EXACTLY. 🚨

${comboDescriptions}

HOW TO USE THESE COMBOS (MANDATORY PROCESS):
1. Pick ONE combo option from above (e.g., Option 2)
2. Look at the CR Pattern (e.g., [2× CR 6, 1× CR 7])
3. From the monster library below, find monsters with those EXACT CRs:
   - Find 2 different CR 6 monsters that fit the theme
   - Find 1 CR 7 monster that fits the theme
4. Your "monsters" array must have exactly 2 entries with cr:"6" and 1 entry with cr:"7"
5. DO NOT substitute different CRs (e.g., don't use CR 8 if the pattern says CR 7)

WORKED EXAMPLE:
If Option 1 is "[2× CR 5, 1× CR 6]", you might respond:
{
  "monsters": [
    {"filename": "...", "name": "Orc", "cr": "5", "count": 1, ...},
    {"filename": "...", "name": "Bugbear", "cr": "5", "count": 1, ...},
    {"filename": "...", "name": "Ogre", "cr": "6", "count": 1, ...}
  ]
}
Note: Two different CR 5 monsters, one CR 6 monster.

FILTERED MONSTER LIBRARY (${filteredMonsters.length} thematically relevant options):
NOTE: Low CR creatures (even CR 0-2) are included for thematic elite+minions pairings. 
The pre-calculated combos balance them appropriately with higher CR bosses.
${monsterListSample}

TASK: Determine if you should recommend specific monsters for an encounter.

When to recommend monsters:
- User asks for monster suggestions or recommendations
- User wants to balance an encounter
- User describes an encounter and wants appropriate enemies
- User asks what creatures would fit a theme or location

Return ONLY valid JSON with NO text before or after:
{
  "shouldPropose": true or false,
  "encounterId": "${targetEncounter.id}",
  "explanation": "Brief explanation under 200 chars using you and we",
  "monsters": [
    {
      "filename": "exact-filename-from-library",
      "name": "Monster Name",
      "cr": "CR value",
      "role": "combat role",
      "count": number-of-this-monster,
      "reasoning": "Why this monster fits - under 100 chars"
    }
  ],
  "reasoning": "Overall explanation of the encounter composition - under 200 chars",
  "totalXP": number - CRITICAL: Sum of (each monster's CR XP × count). Example: 2 CR 8 monsters = 2 × 3900 = 7800 XP. MUST total ${Math.round(budget * 0.95)}-${Math.round(budget * 1.05)} XP,
  "budgetXP": ${budget}
}

CRITICAL JSON RULES:
- MUST match a CR pattern from the pre-calculated combos EXACTLY
- Example: If combo says "2× CR 6, 1× CR 7", your monsters array must have exactly two CR 6 monsters and one CR 7 monster
- All property names in double quotes
- All string values in double quotes  
- NO newlines inside strings - use spaces
- Keep strings SHORT
- Use EXACT filenames from the monster library
- Prefer 1-4 creatures total (avoid hordes)
- Use 1-3 different stat blocks
- Mix roles for interesting combat
- MUST: totalXP between ${Math.round(budget * 0.95)} and ${Math.round(budget * 1.05)}`

      console.log('Requesting monster suggestions from LLM after keyword approval...')
      const monsterResponse = await window.spark.llm(monsterPrompt, 'gpt-4o', true)
      
      console.log('Raw LLM response (monsters after keywords):', monsterResponse.substring(0, 500))
      
      let monsterProposal
      try {
        monsterProposal = parseJsonSafely(monsterResponse)
      } catch (parseError) {
        console.error('Failed to parse monster response')
        console.error('Full response:', monsterResponse)
        console.error('Parse error:', parseError)
        throw new Error(`Invalid JSON in monster response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
      }

      if (monsterProposal.shouldPropose && monsterProposal.monsters?.length > 0) {
        // Validate and create proposal message
        const calculatedTotalXP = monsterProposal.monsters.reduce((sum: number, m: any) => {
          const xp = crToXP(m.cr)
          return sum + (xp * m.count)
        }, 0)
        
        const totalXP = calculatedTotalXP
        console.log(`AI reported ${monsterProposal.totalXP} XP, actual calculation: ${calculatedTotalXP} XP`)
        
        const totalCreatures = monsterProposal.monsters.reduce((sum: number, m: any) => sum + m.count, 0)
        
        const warnings: string[] = []
        const errors: string[] = []
        
        if (totalXP < budget * 0.95 || totalXP > budget * 1.05) {
          const chosenCRs = monsterProposal.monsters.map((m: any) => 
            `${m.count}× CR ${m.cr}`
          ).join(', ')
          errors.push(`XP ${totalXP} is outside valid range ${Math.round(budget * 0.95)}-${Math.round(budget * 1.05)}. Chosen: [${chosenCRs}]. Must use pre-calculated combo CR patterns exactly`)
        }

        const proposalData: MonsterProposal = {
          encounterId: targetEncounter.id,
          encounterTitle: targetEncounter.title,
          monsters: monsterProposal.monsters,
          explanation: monsterProposal.explanation,
          reasoning: monsterProposal.reasoning,
          totalXP,
          budgetXP: budget
        }

        let content = monsterProposal.explanation
        if (errors.length > 0) {
          content = `⚠️ **Issues with this suggestion:**\n${errors.map(e => `• ${e}`).join('\n')}\n\n${content}`
        } else if (warnings.length > 0) {
          content = `⚠️ ${warnings.join(' ')}\n\n${content}`
        }

        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
          monsterProposal: proposalData,
          monsterProposalStatus: errors.length > 0 ? undefined : 'pending'
        }

        setMessages((prev) => [...prev, assistantMessage])
      } else {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: monsterProposal.explanation || "I couldn't find suitable monsters for this encounter. Try describing what kind of creatures you're looking for.",
          timestamp: Date.now()
        }
        setMessages((prev) => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error('Error in continueMonsterSuggestion:', error)
      toast.error('Failed to generate monster suggestions')
    } finally {
      setIsLoading(false)
    }
  }


  if (isCollapsed) {
    return (
      <motion.div
        initial={{ x: 100 }}
        animate={{ x: 0 }}
        className="fixed right-6 bottom-6 z-50"
      >
        <button
          onClick={onToggle}
          className="rounded-full w-14 h-14 bg-gradient-to-b from-[oklch(0.16_0.03_270)] to-[oklch(0.18_0.03_270)] border-2 border-[oklch(0.65_0.15_40)]/50 shadow-lg hover:shadow-xl hover:border-[oklch(0.65_0.15_40)]/70 transition-all hover:scale-105 active:scale-100 flex items-center justify-center"
        >
          <Sparkle weight="fill" className="w-7 h-7 text-[oklch(0.70_0.15_40)] drop-shadow-[0_0_8px_oklch(0.65_0.15_40_/_0.6)]" />
        </button>
      </motion.div>
    )
  }

  return (
    <motion.aside
      initial={{ x: 400 }}
      animate={{ x: 0 }}
      exit={{ x: 400 }}
      className="fixed right-0 w-96 bg-card/95 backdrop-blur-sm border-l-2 border-border shadow-2xl flex flex-col"
      style={{ 
        top: '0',
        bottom: '0',
        height: '100vh',
        zIndex: 30
      }}
    >
      <div className="p-4 border-b-2 border-border flex items-center justify-between bg-primary/10 flex-shrink-0 mt-[9.5rem]">
        <div className="flex items-center gap-2">
          <Sparkle weight="fill" className="w-5 h-5 text-[oklch(0.70_0.15_40)]" />
          <h3 className="font-bold uppercase text-sm tracking-wide">AI Companion</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} className="hover:bg-muted">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'bg-secondary/50 text-foreground border border-border'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {message.proposal && message.proposalStatus === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    {message.proposal.cards.length > 0 && (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Proposing to add {message.proposal.cards.length} card(s) to the canvas
                          {message.proposal.connections && message.proposal.connections.length > 0 && 
                            ` with ${message.proposal.connections.length} connection(s)`
                          }:
                        </div>
                        <ul className="text-xs space-y-1 ml-2">
                          {message.proposal.cards.map((card, idx) => (
                            <li key={idx} className="text-muted-foreground">
                              • <span className="font-medium text-foreground">{card.title}</span> ({card.type ? card.type.replace('-', ' ') : 'unknown'})
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {message.proposal.edits && message.proposal.edits.length > 0 && (
                      <>
                        <div className="text-xs text-yellow-400 font-semibold mt-3">
                          ✏️ Proposing to edit {message.proposal.edits.length} existing card(s):
                        </div>
                        <ul className="text-xs space-y-2 ml-2">
                          {message.proposal.edits.map((edit, idx) => (
                            <li key={idx} className="border-l-2 border-yellow-400/50 pl-2 py-1">
                              <div className="font-semibold text-yellow-400">"{edit.currentTitle}"</div>
                              <div className="text-muted-foreground mt-0.5">
                                <span className="text-red-400 line-through">{edit.currentTitle}</span> → <span className="text-green-400">{edit.newTitle}</span>
                              </div>
                              <div className="text-muted-foreground text-[10px] mt-1 italic">
                                {edit.changeReason}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <Check className="w-3 h-3" weight="bold" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <XCircle className="w-3 h-3" weight="bold" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {message.proposal && message.proposalStatus === 'accepted' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" weight="bold" />
                      Proposal accepted - {message.proposal.cards.length > 0 && message.proposal.edits && message.proposal.edits.length > 0 
                        ? `${message.proposal.cards.length} card(s) added, ${message.proposal.edits.length} edited`
                        : message.proposal.cards.length > 0 
                          ? 'cards added to canvas' 
                          : 'cards edited'}
                    </div>
                  </div>
                )}

                {message.proposal && message.proposalStatus === 'rejected' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <XCircle className="w-3 h-3" weight="bold" />
                      Proposal rejected
                    </div>
                  </div>
                )}

                {message.overviewProposal && message.overviewProposalStatus === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <div className="text-xs text-muted-foreground font-semibold">
                      Proposing changes to overview:
                    </div>
                    <ul className="text-xs space-y-1.5 ml-2">
                      {message.overviewProposal.title && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Title:</span> {message.overviewProposal.title}
                        </li>
                      )}
                      {message.overviewProposal.pitch && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Pitch:</span> {message.overviewProposal.pitch}
                        </li>
                      )}
                      {message.overviewProposal.structureType && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Structure Type:</span> {message.overviewProposal.structureType === 'act-based' ? 'Linear (Act-Based)' : message.overviewProposal.structureType === 'branching' ? 'Branching' : message.overviewProposal.structureType === 'sandbox' ? 'Sandbox' : 'Decide Later'}
                        </li>
                      )}
                      {message.overviewProposal.coreConflict && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Core Conflict:</span> {message.overviewProposal.coreConflict}
                        </li>
                      )}
                      {message.overviewProposal.antagonistGoals && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Antagonist Goals:</span> {message.overviewProposal.antagonistGoals}
                        </li>
                      )}
                      {message.overviewProposal.themes && message.overviewProposal.themes.length > 0 && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Themes:</span> {message.overviewProposal.themes.join(', ')}
                        </li>
                      )}
                      {message.overviewProposal.playerCount !== undefined && (
                        <li className="text-muted-foreground">
                          <span className="font-medium text-foreground">Players:</span> {message.overviewProposal.playerCount}
                        </li>
                      )}
                    </ul>

                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptOverviewProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <Check className="w-3 h-3" weight="bold" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectOverviewProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <XCircle className="w-3 h-3" weight="bold" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {message.overviewProposal && message.overviewProposalStatus === 'accepted' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" weight="bold" />
                      Overview updated
                    </div>
                  </div>
                )}

                {message.overviewProposal && message.overviewProposalStatus === 'rejected' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <XCircle className="w-3 h-3" weight="bold" />
                      Proposal rejected
                    </div>
                  </div>
                )}

                {message.keywordSuggestion && message.keywordSuggestionStatus === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                    <div className="text-xs">
                      <div className="font-semibold text-muted-foreground mb-2">Suggested themes:</div>
                      <div className="flex flex-wrap gap-2">
                        {message.keywordSuggestion.keywords.map((keyword, idx) => (
                          <span key={idx} className="px-2 py-1 bg-[oklch(0.35_0.08_300)]/20 text-foreground rounded-md text-xs font-medium border border-[oklch(0.35_0.08_300)]/30">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptKeywordSuggestion(message.id)}
                        className="gap-1 flex-1"
                      >
                        <Check className="w-3 h-3" weight="bold" />
                        Use These Themes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectKeywordSuggestion(message.id)}
                        className="gap-1 flex-1"
                      >
                        <XCircle className="w-3 h-3" weight="bold" />
                        Different Themes
                      </Button>
                    </div>
                  </div>
                )}

                {message.keywordSuggestion && message.keywordSuggestionStatus === 'accepted' && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                    <Check className="w-3 h-3" weight="bold" />
                    <span>Themes accepted</span>
                  </div>
                )}

                {message.keywordSuggestion && message.keywordSuggestionStatus === 'rejected' && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <XCircle className="w-3 h-3" weight="bold" />
                    <span>Themes rejected</span>
                  </div>
                )}

                {message.monsterProposal && message.monsterProposalStatus === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <div className="text-xs text-muted-foreground font-semibold">
                      Proposing monsters for: <span className="text-accent">{message.monsterProposal.encounterTitle}</span>
                    </div>
                    <ul className="text-xs space-y-1.5 ml-2">
                      {message.monsterProposal.monsters.map((monster, idx) => (
                        <li key={idx} className="text-muted-foreground">
                          <span className="font-medium text-foreground">{monster.count}x {monster.name}</span>
                          <div className="ml-4 text-[11px]">
                            CR {monster.cr} • {monster.role}
                            {monster.reasoning && (
                              <div className="text-muted-foreground italic mt-0.5">{monster.reasoning}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {message.monsterProposal.reasoning && (
                      <div className="text-xs text-muted-foreground italic mt-2 p-2 bg-accent/5 rounded border border-accent/20">
                        {message.monsterProposal.reasoning}
                      </div>
                    )}
                    {message.monsterProposal.totalXP && message.monsterProposal.budgetXP && (
                      <div className="text-xs mt-2 p-2 rounded border border-accent/30 bg-accent/5">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-muted-foreground">XP Budget:</span>
                          <span className="font-medium">{message.monsterProposal.budgetXP} XP</span>
                        </div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-muted-foreground">Total Monster XP:</span>
                          <span className={`font-medium ${message.monsterProposal.totalXP > message.monsterProposal.budgetXP * 1.1 ? 'text-red-400' : 'text-green-400'}`}>
                            {message.monsterProposal.totalXP} XP
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Budget Usage:</span>
                          <span className={`font-medium ${message.monsterProposal.totalXP > message.monsterProposal.budgetXP * 1.1 ? 'text-red-400' : 'text-green-400'}`}>
                            {Math.round((message.monsterProposal.totalXP / message.monsterProposal.budgetXP) * 100)}%
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptMonsterProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <Check className="w-3 h-3" weight="bold" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectMonsterProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <XCircle className="w-3 h-3" weight="bold" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {message.monsterProposal && message.monsterProposalStatus === 'accepted' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" weight="bold" />
                      Monsters added to encounter
                    </div>
                  </div>
                )}

                {message.monsterProposal && message.monsterProposalStatus === 'rejected' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <XCircle className="w-3 h-3" weight="bold" />
                      Proposal rejected
                    </div>
                  </div>
                )}

                {message.npcProposal && message.npcProposalStatus === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                    <div className="text-xs text-muted-foreground font-semibold">
                      Proposing {message.npcProposal.npcs.length} NPC{message.npcProposal.npcs.length > 1 ? 's' : ''}:
                    </div>
                    <ul className="text-xs space-y-2 ml-2">
                      {message.npcProposal.npcs.map((npc, idx) => (
                        <li key={idx} className="border-l-2 border-accent/50 pl-2 py-1">
                          <div className="font-semibold text-accent">{npc.name}</div>
                          <div className="text-muted-foreground text-[11px] mt-0.5">
                            Role: {npc.role}
                          </div>
                          {npc.secrets && npc.secrets.length > 0 && (
                            <div className="text-muted-foreground text-[11px] mt-1 italic">
                              {npc.secrets.length} secret{npc.secrets.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptNPCProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <Check className="w-3 h-3" weight="bold" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectNPCProposal(message.id)}
                        className="gap-1 flex-1"
                      >
                        <XCircle className="w-3 h-3" weight="bold" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {message.npcProposal && message.npcProposalStatus === 'accepted' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" weight="bold" />
                      NPCs added to adventure
                    </div>
                  </div>
                )}

                {message.npcProposal && message.npcProposalStatus === 'rejected' && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <XCircle className="w-3 h-3" weight="bold" />
                      Proposal rejected
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-secondary/50 rounded-lg px-4 py-2 border border-border">
                <Sparkle className="w-5 h-5 text-accent animate-pulse" weight="fill" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t-2 border-border bg-secondary/30 flex-shrink-0">
        <div className="flex gap-2 mb-3 flex-wrap">
          {getQuickActions(adventure.stage).map((action, i) => (
            <button
              key={i}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-card border-2 border-[oklch(0.65_0.15_40)]/50 text-[oklch(0.75_0.12_40)] hover:border-[oklch(0.65_0.15_40)]/70 hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {action}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Ask your AI companion..."
            rows={2}
            disabled={isLoading}
            className="resize-none bg-background border-border"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="self-end px-4 py-2 rounded-md bg-card border-2 border-[oklch(0.65_0.15_40)]/50 text-[oklch(0.75_0.12_40)] hover:border-[oklch(0.65_0.15_40)]/70 hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            <CaretRight weight="fill" className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.aside>
  )
}

function getStageGreeting(stage: string, adventure?: Adventure): string {
  if (stage === 'structure' && adventure) {
    return `Let's build your adventure structure! I can generate a complete encounter flow for your adventure, or you can ask me about specific encounters. Tell me what kind of structure you'd like and I'll create it!`
  }
  
  const greetings: Record<string, string> = {
    overview: "Welcome! Let's create your adventure together. Start by telling me what kind of adventure you want to create, or fill in the pitch field to get started. I can help you with the adventure pitch, structure type selection, core conflict, and antagonist setup.",
    structure: "Let's build your adventure structure! I can generate a complete 3-act encounter flow right now, or you can ask me about specific encounters you're envisioning. Just tell me what you need!",
    locations: "Ready to bring your world to life! Want me to sketch a list of key locations based on your structure?",
    encounters: "Let's design memorable encounters! I can recommend monsters from our library of 500+ D&D 5e creatures, balance encounters for your party, and help set stakes. Just tell me which encounter needs creatures!",
    npcs: "Time to populate your world with memorable characters! Want help creating NPCs with full personalities and DALL-E portraits?",
    rewards: "Let's reward your players appropriately! Based on your encounters, would you like me to propose balanced treasure rewards?",
    'gm-mode': "GM Mode activated! I'm here to help you run your adventure. Need scene descriptions, NPC reactions, or improvisation support? Just ask!",
  }
  return greetings[stage] || "How can I assist you with your adventure?"
}

function getQuickActions(stage: string): string[] {
  const actions: Record<string, string[]> = {
    overview: ["Suggest title", "Improve pitch", "Create antagonist"],
    structure: ["Generate 3-act", "Explain cards", "Design flow"],
    locations: ["Create location", "Add sensory details", "Design map"],
    encounters: ["Recommend monsters", "Balance encounter", "Set stakes"],
    npcs: ["Create NPC", "Create antagonist", "Add personality"],
    rewards: ["Generate treasure", "Balance rewards", "Add magic item"],
    'gm-mode': ["Describe scene", "NPC reaction", "Random complication"],
  }
  return actions[stage] || ["Help me", "Suggest", "Improve"]
}

function buildStageContext(adventure: Adventure): string {
  if (adventure.stage === 'overview') {
    const antagonistNames = (adventure.overview.antagonistIds || [])
      .map(id => adventure.npcs.find(npc => npc.id === id)?.name)
      .filter(Boolean)
      .join(', ')

    return `
CURRENT OVERVIEW STATE:
- Title: ${adventure.name}
- Pitch: ${adventure.overview.pitch || '(not set)'}
- Core Conflict: ${adventure.overview.coreConflict || '(not set)'}
- Antagonists: ${antagonistNames || '(none selected)'}
- Antagonist Goals: ${adventure.overview.antagonistGoals || '(not set)'}
- Themes: ${adventure.overview.themes.length > 0 ? adventure.overview.themes.join(', ') : '(none selected)'}
- Party Level: ${adventure.overview.partyLevelAverage}
- Player Count: ${adventure.overview.playerCount}

You can help the user refine any of these elements, especially:
- Crafting a compelling adventure pitch
- Defining the core conflict that drives the story
- Identifying antagonists and their goals
`
  }

  if (adventure.stage === 'structure') {
    const encounterTypesInfo = ENCOUNTER_TYPES.map((t, idx) => {
      const useCases = t.useCases.slice(0, 3).join(', ')
      return `${idx + 1}. **${t.label}** (type: "${t.type}") - ${t.description}. Use for: ${useCases}. Example: Create an encounter where players ${t.useCases[0].toLowerCase()}.`
    }).join('\n\n')

    return `
ENCOUNTER TYPE LIBRARY REFERENCE:
${formatEncounterTypesForAI()}

EXISTING ENCOUNTERS ON CANVAS:
${adventure.structure.encounters.length > 0 ? 
  adventure.structure.encounters.map(b => `- ID: ${b.id}, Title: "${b.title}", Type: ${b.type}, Position: (${b.position.x}, ${b.position.y})`).join('\n') : 
  'No encounters have been added yet - the canvas is empty! This is a great opportunity to propose a complete structure.'}

EXISTING CONNECTIONS:
${adventure.structure.connections.length > 0 ?
  adventure.structure.connections.map(c => `- From ${c.from} to ${c.to}`).join('\n') :
  'No connections exist yet.'}

ADVENTURE CONTEXT:
${adventure.overview.pitch ? `Pitch: ${adventure.overview.pitch}` : 'No pitch defined yet.'}
${adventure.overview.coreConflict ? `Core Conflict: ${adventure.overview.coreConflict}` : ''}
${adventure.overview.themes.length > 0 ? `Themes: ${adventure.overview.themes.join(', ')}` : ''}
`
  }

  if (adventure.stage === 'encounters') {
    const encountersWithCreatures = adventure.structure.encounters.filter(e => 
      (e.creatures && e.creatures.length > 0) || (e.npcs && e.npcs.length > 0)
    )
    const combatEncounters = adventure.structure.encounters.filter(e => e.type === 'combat')
    const encountersNeedingCreatures = adventure.structure.encounters.filter(e => 
      (e.type === 'combat' || e.type === 'chase') && (!e.creatures || e.creatures.length === 0) && (!e.npcs || e.npcs.length === 0)
    )
    
    const selectedEncounter = adventure.selectedEncounterId 
      ? adventure.structure.encounters.find(e => e.id === adventure.selectedEncounterId)
      : null
    
    return `
CURRENT ENCOUNTERS STATE:
- Total Encounters: ${adventure.structure.encounters.length}
- Combat Encounters: ${combatEncounters.length}
- Encounters with Participants: ${encountersWithCreatures.length}
- Encounters Needing Creatures: ${encountersNeedingCreatures.length}
- Party Level: ${adventure.overview.partyLevelAverage}
- Party Size: ${adventure.overview.playerCount} players

${selectedEncounter ? `
🎯 CURRENTLY SELECTED ENCOUNTER:
[ID: ${selectedEncounter.id}] "${selectedEncounter.title}" (${selectedEncounter.type})
- Difficulty: ${selectedEncounter.difficulty}
- Current Creatures: ${selectedEncounter.creatures?.length || 0}
- Current NPCs: ${selectedEncounter.npcs?.length || 0}
- Description: ${selectedEncounter.description || '(none)'}
- Stakes: ${selectedEncounter.stakes || '(none)'}

⚠️ IMPORTANT: Unless the user specifically mentions a different encounter, recommend monsters for THIS encounter!
` : ''}

ALL ENCOUNTERS:
${adventure.structure.encounters.length > 0 ? adventure.structure.encounters.map((enc, idx) => {
  const creatureCount = (enc.creatures?.length || 0)
  const npcCount = (enc.npcs?.length || 0)
  const npcNames = (enc.npcs || []).map(id => adventure.npcs.find(n => n.id === id)?.name || 'Unknown').join(', ')
  const needsCreatures = (enc.type === 'combat' || enc.type === 'chase') && creatureCount === 0 && npcCount === 0
  const isSelected = enc.id === adventure.selectedEncounterId
  return `${idx + 1}. [ID: ${enc.id}] "${enc.title}" (${enc.type})${isSelected ? ' 👈 SELECTED' : ''}${needsCreatures ? ' ⚠️ NEEDS CREATURES' : ''}
   - Difficulty: ${enc.difficulty}
   - Creatures: ${creatureCount}
   - NPCs: ${npcCount > 0 ? `${npcCount} (${npcNames})` : '0'}
   - Description: ${enc.description || '(none)'}`
}).join('\n') : 'No encounters created yet.'}

MONSTER LIBRARY ACCESS:
You have access to a comprehensive library of 500+ D&D 5e monsters including:
- All official creature types (aberration, beast, celestial, construct, dragon, elemental, fey, fiend, giant, humanoid, monstrosity, ooze, plant, undead)
- CR range from 0 to 30
- Combat roles: striker, tank, controller, support, skirmisher, artillery, infiltrator
- Theme keywords: urban, wilderness, dungeon, underdark, underwater, aerial, planar, etc.

ENCOUNTER BALANCING GUIDANCE (D&D 2024 rules):
For a party of ${adventure.overview.playerCount} level ${adventure.overview.partyLevelAverage} characters:
- Easy: Total XP around ${100 * adventure.overview.partyLevelAverage * adventure.overview.playerCount}
- Medium: Total XP around ${150 * adventure.overview.partyLevelAverage * adventure.overview.playerCount}
- Hard: Total XP around ${200 * adventure.overview.partyLevelAverage * adventure.overview.playerCount}
- Deadly: Total XP around ${300 * adventure.overview.partyLevelAverage * adventure.overview.playerCount}

ACTION ECONOMY TIP: Multiple weaker enemies can challenge a party more than a single strong enemy of equivalent CR.

You can help the user:
- Recommend specific monsters from the library based on encounter type, theme, and CR
- Balance combat encounters for the party level and size
- Suggest appropriate creatures for encounters based on location and story context
- Add NPCs to encounters for social or combat situations
- Improve encounter descriptions and set stakes/consequences
- Ensure encounters match their type (combat, social, investigation, etc.)

When recommending monsters, you can propose them and the user will approve or reject the additions.
Use the encounter ID when proposing monsters so they can be added to the correct encounter.
`
  }

  if (adventure.stage === 'npcs') {
    const npcsWithPortraits = adventure.npcs.filter(npc => npc.portraitUrl).length
    const npcsInEncounters = adventure.npcs.filter(npc => 
      adventure.structure.encounters.some(enc => enc.npcs?.includes(npc.id))
    ).length

    return `
CURRENT NPCs STATE:
- Total NPCs: ${adventure.npcs.length}
- NPCs with Portraits: ${npcsWithPortraits}
- NPCs in Encounters: ${npcsInEncounters}

EXISTING NPCs:
${adventure.npcs.length > 0 ? adventure.npcs.map((npc, idx) => {
  const inEncounters = adventure.structure.encounters.filter(enc => enc.npcs?.includes(npc.id)).map(enc => enc.title).join(', ')
  return `${idx + 1}. "${npc.name}"
   - Role: ${npc.role || '(not set)'}
   - Appearance: ${npc.appearance || '(not set)'}
   - Personality: ${npc.personality || '(not set)'}
   - Secrets: ${npc.secrets.length > 0 ? npc.secrets.join('; ') : '(none)'}
   - Has Portrait: ${npc.portraitUrl ? 'Yes' : 'No'}
   - In Encounters: ${inEncounters || '(none)'}`
}).join('\n\n') : 'No NPCs created yet.'}

IMPORTANT RULES FOR NPC CREATION:
When creating or proposing NPCs, the Appearance field MUST include:
1. **Race/Species** (e.g., human, elf, dwarf, tiefling, dragonborn, etc.)
2. **Gender** (e.g., male, female, non-binary)
3. **Physical details** (age, build, height, distinctive features, clothing, etc.)

Example good appearance: "A middle-aged female human with weathered bronze skin, piercing green eyes, and silver-streaked black hair tied in a warrior's braid. She wears scarred leather armor adorned with tribal feather tokens and carries herself with the confidence of a seasoned mercenary."

Example bad appearance: "Tall with dark hair and intimidating presence." ❌ (Missing race and gender)

The appearance description is used to generate DALL-E portraits, so it must be detailed and specific.

You can help the user:
- Create new NPCs with complete details (name, role, appearance, personality, secrets)
- Develop NPC personalities and motivations
- Suggest NPC secrets and connections to the adventure
- Create relationships between NPCs
- Suggest appropriate NPCs for specific encounters or roles
- Ensure NPCs have detailed appearance descriptions for portrait generation

When creating NPCs, you can propose them in a structured format and the user will approve or reject them.
Each NPC should be memorable, serve a purpose in the adventure, and have depth beyond surface details.
`
  }
  
  return ''
}
