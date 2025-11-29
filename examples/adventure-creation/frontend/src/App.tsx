import { useState, useEffect } from 'react'
import { useAdventure } from '@/hooks/useAdventure'
import { Adventure, Stage } from '@/types/adventure'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { Sparkle, Scroll, Buildings, Sword, Users, Gift, Play, MapPin, Cpu } from '@phosphor-icons/react'
import AICompanion from '@/components/AICompanion'
import OverviewStage from '@/components/stages/OverviewStage'
import StructureStage from '@/components/stages/StructureStage'
import LocationsStage from '@/components/stages/LocationsStage'
import EncountersStageV2 from '@/components/stages/EncountersStageV2'
import NPCsStage from '@/components/stages/NPCsStage'
import RewardsStage from '@/components/stages/RewardsStage'
import StatBuilderStage from '@/components/stages/StatBuilderStage'
import GMMode from '@/components/stages/GMMode'
import { motion, AnimatePresence } from 'framer-motion'
import ParticleEffect from '@/components/ParticleEffect'

const STAGE_INFO = {
  overview: { label: 'Overview', icon: Scroll, color: 'text-accent' },
  structure: { label: 'Structure', icon: MapPin, color: 'text-blue-400' },
  encounters: { label: 'Encounters', icon: Sword, color: 'text-orange-400' },
  npcs: { label: 'NPCs', icon: Users, color: 'text-accent' },
  'gm-mode': { label: 'GM Mode', icon: Play, color: 'text-primary' },
}

function App() {
  const [adventure, setAdventure] = useAdventure<Adventure | null>('current-adventure', null)

  const [isAICollapsed, setIsAICollapsed] = useState(true)

  const createNewAdventure = () => {
    const newAdventure: Adventure = {
      id: crypto.randomUUID(),
      name: 'Untitled Adventure',
      stage: 'overview',
      overview: {
        pitch: '',
        themes: [],
        gmNotes: '',
        partyLevelAverage: 3,
        playerCount: 4,
        coreConflict: '',
        antagonistIds: [],
        antagonistGoals: '',
      },
      conflict: {
        villain: null,
        conflictDescription: '',
        factions: [],
        relationships: [],
      },
      structure: {
        encounters: [],
        connections: [],
      },
      locations: [],
      npcs: [],
      rewards: [],
      customStatBlocks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setAdventure(newAdventure)
  }

  const updateAdventure = (updates: Partial<Adventure>) => {
    setAdventure((current: Adventure | null) => {
      if (!current) return null
      return {
        ...current,
        ...updates,
        updatedAt: Date.now(),
      }
    })
  }

  const changeStage = (stage: Stage) => {
    setAdventure((current: Adventure | null) => {
      if (!current) return null
      return {
        ...current,
        stage,
        updatedAt: Date.now(),
      }
    })
  }

  const renderStage = () => {
    if (!adventure) return null

    switch (adventure.stage) {
      case 'overview':
        return <OverviewStage adventure={adventure} updateAdventure={updateAdventure} />
      case 'structure':
        return <StructureStage adventure={adventure} updateAdventure={updateAdventure} />
      case 'locations':
        return <LocationsStage adventure={adventure} updateAdventure={updateAdventure} />
      case 'encounters':
        return <EncountersStageV2 adventure={adventure} updateAdventure={updateAdventure} />
      case 'npcs':
        return <NPCsStage adventure={adventure} updateAdventure={updateAdventure} />
      case 'rewards':
        return <RewardsStage adventure={adventure} updateAdventure={updateAdventure} />
      case 'stat-builder':
        return <StatBuilderStage adventure={adventure} updateAdventure={updateAdventure} />
      case 'gm-mode':
        return <GMMode adventure={adventure} updateAdventure={updateAdventure} />
      default:
        return null
    }
  }

  if (!adventure) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="ornate-border fancy-card p-12 glow-border-animated relative overflow-hidden">
            <ParticleEffect />
            <div className="relative z-10">
              <Sparkle className="w-20 h-20 text-[oklch(0.70_0.15_40)] mx-auto mb-6 drop-shadow-[0_0_15px_oklch(0.65_0.15_40_/_0.6)]" weight="fill" />
              <h1 className="text-4xl mb-4 text-golden">Welcome to Adventure Forge</h1>
              <p className="text-lg text-muted-foreground mb-8 font-normal tracking-normal">
                Create immersive D&D adventures with AI assistance. Start from scratch and let the AI guide you through every step.
              </p>
              <Button 
                variant="default"
                size="lg" 
                className="gap-2"
                onClick={createNewAdventure}
              >
                <Sparkle weight="fill" />
                Begin Your Adventure
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-background/95">
      <Toaster position="top-right" />
      <header className="border-b-2 border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40 shadow-lg shadow-primary/10 relative">
        <ParticleEffect />
        <div className="container mx-auto px-6 py-4 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <Sparkle className="w-10 h-10 text-[oklch(0.70_0.15_40)] drop-shadow-[0_0_10px_oklch(0.65_0.15_40_/_0.5)]" weight="fill" />
              <div className="absolute inset-0 animate-pulse">
                <Sparkle className="w-10 h-10 text-[oklch(0.65_0.15_40)]/30" weight="fill" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl tracking-wider text-golden">Adventure Forge</h1>
              <p className="text-sm text-muted-foreground font-normal uppercase tracking-wide">
                {adventure.name}
              </p>
            </div>
          </div>

          <Tabs value={adventure.stage} onValueChange={(v) => changeStage(v as Stage)}>
            <TabsList className="elegant-tabs-list w-full justify-start">
              {Object.entries(STAGE_INFO).map(([key, info]) => {
                return (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="elegant-tab-trigger gap-2"
                  >
                    <span>{info.label}</span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="flex-1 flex relative">
        <AnimatePresence mode="wait">
          <motion.main
            key={adventure.stage}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className={`flex-1 overflow-auto transition-all duration-300 ${
              isAICollapsed ? 'mr-0' : 'mr-96'
            }`}
          >
            <div className="container mx-auto px-6 py-8">
              {renderStage()}
            </div>
          </motion.main>
        </AnimatePresence>

        <AICompanion
          adventure={adventure}
          updateAdventure={updateAdventure}
          isCollapsed={isAICollapsed}
          onToggle={() => setIsAICollapsed(!isAICollapsed)}
        />
      </div>
    </div>
  )
}

export default App
