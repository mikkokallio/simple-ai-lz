# Planning Guide

A magical creative studio for designing and running tabletop RPG adventures, featuring a persistent AI familiar who proactively assists and can interact with the UI in real time.

**Experience Qualities**:
1. **Enchanting** - Every interaction should feel like casting a spell, with subtle animations and glowing effects that reward engagement
2. **Supportive** - The AI companion is always present, anticipating needs and offering guidance without being intrusive
3. **Cohesive** - Despite the complexity of adventure creation, every stage flows naturally with a unified magical-fantasy design language

**Complexity Level**: Complex Application (advanced functionality, accounts)
This is a multi-stage adventure creation platform with persistent state management, real-time AI interaction, relationship mapping, encounter balancing, and live GM session running capabilities.

## Essential Features

### Persistent AI Companion (Right Pane)
- **Functionality**: Always-visible AI assistant that understands current stage, proactively offers help, can directly edit any field, and provides context-aware tools. In Structure stage, AI can propose adding multiple cards to the canvas, which users must approve/reject before changes are applied.
- **Purpose**: Reduces cognitive load during complex adventure creation, acts as co-creator rather than just tool
- **Trigger**: Auto-appears with stage-specific prompts; user can chat freely or use context tools
- **Progression**: User enters stage → AI greets with relevant suggestion → User accepts/ignores/customizes → AI updates fields with magical animations → Changes persist. For canvas edits: User requests structure → AI proposes card additions → User sees proposal with Accept/Reject buttons → User approves → Cards appear on canvas with animations
- **Success criteria**: AI suggestions are contextually relevant, field updates animate smoothly with arcane effects, all changes save properly, canvas proposals show clear preview and require explicit approval

### Stage 1: Adventure Overview
- **Functionality**: Define adventure identity, scope, tone, level, party size, genre tags, hook type
- **Purpose**: Establishes foundational constraints for balancing and narrative metadata for all subsequent stages
- **Trigger**: New adventure creation or editing existing overview
- **Progression**: Enter stage → Fill pitch/themes → Select genre/level → AI offers brainstorming → Accept/refine → Overview saved as constraints
- **Success criteria**: All metadata properly constrains later stages, theme selector glows on selection, AI generates relevant suggestions

### Stage 2: Conflict & Factions
- **Functionality**: Create villain card, define conflicts, build faction cards with relationships
- **Purpose**: Anchors story structure and provides narrative hooks for encounters
- **Trigger**: Completing overview or navigating to this stage
- **Progression**: Define villain → Add factions → Draw relationship threads → AI suggests conflicts → Map animates with glowing connections
- **Success criteria**: Relationship web displays correctly, threads shimmer when AI edits, factions influence later encounters

### Stage 3: Adventure Structure
- **Functionality**: Choose structure type (act-based/branching/sandbox), drag-and-drop story beats from Card Library (Social Encounter, Investigation, Combat, Skill Challenge, Exploration, Puzzle, Rest, Climax), link to factions/clues/locations. AI can propose complete structures that require user approval before adding to canvas. Canvas has strict boundaries (3000x2000px) displayed with dashed border - cards cannot be placed outside. Auto-Layout button algorithmically repositions all cards to minimize path crossings and avoid overlaps while maintaining neat alignment.
- **Purpose**: Creates skeleton for location and encounter creation with organized, readable flow
- **Trigger**: Navigating to structure stage
- **Progression**: Select structure type → AI generates template proposal → User reviews card list with Accept/Reject buttons → User accepts → Cards appear on canvas → User drags beats into place → Link to elements → Click Auto-Layout to optimize positioning → Flowchart updates with arcane animations
- **Success criteria**: Beats move smoothly with spark trails, arrows connect properly, structure exports to later stages, AI proposals are contextual and require explicit approval with clear preview, canvas boundaries prevent lost cards, auto-layout produces clean readable graphs

### Stage 4: Locations & Scenes
- **Functionality**: Create location list, design scenes with sensory details, optional maps
- **Purpose**: Scene library for GM mode and encounter placement foundations
- **Trigger**: Navigating to locations stage
- **Progression**: Add location → Create scenes → AI suggests details → Parchment animates with ink strokes → Scenes saved
- **Success criteria**: Location tiles display correctly, scene editor shows animated parchment, AI suggestions enhance descriptions

### Stage 5: Encounter Builder
- **Functionality**: Design encounters with type, monsters/NPCs from comprehensive monster library (500+ D&D 5e creatures), difficulty targets, stakes. Filter monsters by CR range, combat role (striker/tank/controller/etc.), creature type, and thematic keywords. Parse HTML stat blocks into interactive creature cards.
- **Purpose**: Balanced combat/social encounters with quick access to full D&D monster compendium
- **Trigger**: Navigating to encounters or adding from location
- **Progression**: Create encounter → Click "Add from Monster Library" → Filter by CR/role/type/keywords → Select monster → HTML stat block parsed into creature card → Monster added as NPC → Attach to encounter
- **Success criteria**: Monster selector displays 500+ creatures, filters work correctly, HTML parsing creates complete stat blocks with abilities/actions/traits, monsters can be added to encounters and viewed with full stats

### Stage 6: NPC & Creature Library
- **Functionality**: Create NPC cards with names, roles, stats, personalities, secrets, relationships, and AI-generated portraits via DALL-E
- **Purpose**: Dynamic NPC reference throughout adventure and GM mode with visual portraits
- **Trigger**: Navigating to library or adding from other stages
- **Progression**: Create NPC → Fill details → AI suggests personality → Click "Generate Portrait" → DALL-E creates image → Portrait displays on card
- **Success criteria**: Character cards display properly with portraits, DALL-E integration works smoothly, NPCs accessible from all stages

### Stage 7: Rewards & Progression
- **Functionality**: Create magic items, treasure parcels, social/faction rewards
- **Purpose**: Central reward index for balanced treasure distribution
- **Trigger**: Navigating to rewards stage
- **Progression**: Add treasure → Set rarity → AI balances against encounters → Cards sparkle → Rewards indexed
- **Success criteria**: Treasure cards sort properly, AI suggestions match adventure level, sparkle effects trigger on update

### Stage 8: GM Session Mode
- **Functionality**: Run adventure live with AI assistant, scene navigation, initiative tracking, mid-session editing
- **Purpose**: Interactive adventure execution within platform
- **Trigger**: "Run Adventure" button from any stage
- **Progression**: Enter GM mode → Select scene → AI describes → Run encounter → Track initiative → Improvise with AI → Update adventure
- **Success criteria**: All content accessible, AI provides live assistance, scene transitions smooth, changes persist

## Edge Case Handling

- **Empty Adventure States**: Graceful empty states with "Get Started" prompts and AI suggestions for first steps
- **Invalid Relationships**: Prevent orphaned faction threads, validate all connections before saving
- **Balance Overflow**: Cap encounter difficulty, warn when treasure exceeds level guidelines
- **Session Interruption**: Auto-save GM mode state every 30 seconds, allow resume from exact position
- **AI Offline**: Disable AI features gracefully, allow manual editing of all fields
- **Conflicting Edits**: User edits always take precedence, AI offers to "revert" if user dislikes changes

## Design Direction

The design should evoke the feeling of D&D Beyond's digital character sheet interface—sleek, dark, and modern with vibrant purple and magenta accents that glow against deep backgrounds. The interface is rich with layered details, glowing borders, and stat badges that feel like a premium gaming experience. Every card should have animated glowing borders that pulse subtly, creating an alive, magical interface that feels powerful and professional.

## Color Selection

**Complementary palette** (deep purple/magenta, dark slate backgrounds) creates a modern D&D digital interface with high contrast and vibrant accents.

- **Primary Color**: Vivid Magenta `oklch(0.55 0.25 310)` - Communicates energy, magic, D&D brand identity; used for primary actions and active states
- **Secondary Colors**: 
  - Deep Slate `oklch(0.18 0.02 270)` - Main background, provides dark gaming interface feel
  - Dark Card `oklch(0.22 0.03 270)` - Card backgrounds, slightly elevated from page
- **Accent Color**: Bright Purple `oklch(0.60 0.25 320)` - Glowing highlights, interactive elements, success states; creates the signature glow effect
- **Foreground/Background Pairings**:
  - Background (Deep Slate `oklch(0.18 0.02 270)`): Light Gray text `oklch(0.92 0.01 270)` - Ratio 12.4:1 ✓
  - Card (Dark Card `oklch(0.22 0.03 270)`): Light Gray text `oklch(0.92 0.01 270)` - Ratio 11.2:1 ✓
  - Primary (Vivid Magenta `oklch(0.55 0.25 310)`): White text `oklch(0.98 0 0)` - Ratio 5.1:1 ✓
  - Secondary (Darker Slate `oklch(0.28 0.04 270)`): Light text `oklch(0.92 0.01 270)` - Ratio 8.3:1 ✓
  - Accent (Bright Purple `oklch(0.60 0.25 320)`): White text `oklch(0.98 0 0)` - Ratio 4.8:1 ✓
  - Muted (Mid Slate `oklch(0.26 0.03 270)`): Dim text `oklch(0.60 0.01 270)` - Ratio 4.5:1 ✓

## Font Selection

Typography should feel like a modern gaming interface—bold, condensed headers with strong hierarchy for easy scanning during gameplay sessions.

**Roboto Condensed** (sans-serif, bold) for headings - strong, condensed, gaming-inspired feel
**Inter** (sans-serif) for body - exceptional readability, modern and neutral

- **Typographic Hierarchy**: 
  - H1 (Stage Titles): Roboto Condensed Bold/28px/tight letter-spacing (0.02em)/uppercase/line-height 1.2
  - H2 (Section Headers): Roboto Condensed Bold/20px/tight letter-spacing/uppercase/line-height 1.3
  - H3 (Card Titles): Roboto Condensed Bold/16px/normal spacing/uppercase/line-height 1.4
  - Body (Descriptions): Inter Regular/14px/normal spacing/line-height 1.6
  - Small (Labels): Inter Medium/12px/normal spacing/line-height 1.5
  - Tiny (Metadata): Inter Regular/11px/normal spacing/line-height 1.4

## Animations

Animations should feel sleek and modern—subtle glows that pulse on hover, smooth card elevations, and glowing border animations that make the interface feel alive and premium like a high-end gaming app.

- **Purposeful Meaning**: Active elements glow with purple/magenta aura, borders flow with animated gradients, transitions are smooth and quick
- **Hierarchy of Movement**: Primary actions get bright glow effects, cards elevate smoothly on hover, background elements remain static for clarity

**Specific Animation Patterns**:
- Glow border animation: Continuous 3s gradient flow along card borders
- Card hover: 300ms scale up (1.02x) + elevation increase + shadow glow
- Button hover: 200ms glow intensify + subtle scale
- Tab transition: 300ms smooth color/background transition
- Stage transition: 300ms fade + slight vertical movement
- Portrait generation: Sparkle spin animation during load

## Component Selection

- **Components**: 
  - Dialog for NPC editing and modal interactions
  - FancyCard custom component for all cards with glowing animated borders
  - StatBadge custom component for stat displays with gaming aesthetic
  - Tabs for stage navigation with glowing active states
  - ScrollArea for long content lists maintaining dark theme
  - Slider for difficulty/level adjustments styled with purple accents
  - Button for actions with glow effects and hover states
  - Input/Textarea with dark backgrounds and purple focus rings
  - Separator as subtle dividers
  - Tooltip for contextual help with dark styling
  - Badge for tags, styled with purple/magenta colors
  - Progress for balance meters, styled as glowing energy bars

- **Customizations**: 
  - Custom FancyCard component with animated glowing gradient borders
  - Custom StatBadge component for D&D stat displays
  - Custom RelationshipWeb component for faction mapping with canvas/SVG
  - Custom FlowchartCanvas for adventure structure with draggable nodes
  - Custom AICompanionPane with collapsible mode
  - DALL-E integration for NPC portrait generation
  - Empty state cards that guide users to create content
  
- **States**: 
  - Buttons: default (purple bg), hover (glow + scale), active (pressed), focused (ring glow), disabled (faded)
  - Inputs: default (dark bg), focused (purple glow ring), filled (maintained), error (red glow), ai-edited (purple shimmer)
  - Cards: default (glowing border), hover (scale + elevation + enhanced glow), selected (bright border), dragging (increased elevation)
  - FancyCard borders continuously animate with flowing gradient
  
- **Icon Selection**: 
  - Phosphor icons throughout: Scroll (adventures), Sparkle (AI actions), Castle (locations), Sword (encounters), Users (NPCs), Gift (rewards), Play (GM mode), MagicWand (AI suggestions), MapPin (locations), Graph (relationships)
  
- **Spacing**: 
  - Page padding: 6 (24px)
  - Card padding: 4 (16px)
  - Section gaps: 6 (24px)
  - Card grids: gap-4 (16px)
  - Inline elements: gap-2 (8px)
  - Tight groups: gap-1 (4px)
  
- **Mobile**: 
  - AI companion becomes bottom sheet instead of right pane
  - Stage tabs become vertical stacked navigation
  - Card grids shift from 3-column to single column
  - Relationship web becomes scrollable with simplified connections
  - Flowchart canvas uses touch gestures for pan/zoom
  - GM mode uses full screen with swipe navigation between panels
