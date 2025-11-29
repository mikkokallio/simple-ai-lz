import { useState, useEffect } from 'react'
import { useAdventure } from '@/hooks/useAdventure'
import { Adventure, Stage } from '@/types/adventure'
import { adventureAPI } from '@/lib/api'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { Sparkle, Scroll, Buildings, Sword, Users, Gift, Play, MapPin, Cpu, Crown } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import LoginScreen from '@/components/LoginScreen'
import PendingUserScreen from '@/components/PendingUserScreen'
import AICompanion from '@/components/AICompanion'
import OverviewStage from '@/components/stages/OverviewStage'
import StructureStage from '@/components/stages/StructureStage'
import LocationsStage from '@/components/stages/LocationsStage'
import EncountersStageV2 from '@/components/stages/EncountersStageV2'
import NPCsStage from '@/components/stages/NPCsStage'
import RewardsStage from '@/components/stages/RewardsStage'
import StatBuilderStage from '@/components/stages/StatBuilderStage'
import GMMode from '@/components/stages/GMMode'
import AdminView from '@/components/stages/AdminView'
import { motion, AnimatePresence } from 'framer-motion'
import ParticleEffect from '@/components/ParticleEffect'

const STAGE_INFO = {
  overview: { label: 'Overview', icon: Scroll, color: 'text-accent' },
  structure: { label: 'Structure', icon: MapPin, color: 'text-blue-400' },
  encounters: { label: 'Encounters', icon: Sword, color: 'text-orange-400' },
  npcs: { label: 'NPCs', icon: Users, color: 'text-accent' },
  'gm-mode': { label: 'GM Mode', icon: Play, color: 'text-primary' },
  'admin': { label: 'Admin', icon: Crown, color: 'text-destructive' },
}

function App() {
  const { user, isAuthenticated, isLoading: authLoading, refreshUser } = useAuth()
  const [adventure, setAdventure, isLoading, loadAdventure] = useAdventure<Adventure | null>('current-adventure', null)
  const [showStartScreen, setShowStartScreen] = useState(true)
  const [savedAdventures, setSavedAdventures] = useState<Adventure[]>([])
  const [isAICollapsed, setIsAICollapsed] = useState(true)
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin'

  // Load saved adventures list on mount - MUST be before any conditional returns
  useEffect(() => {
    async function loadSavedAdventures() {
      try {
        const adventures = await adventureAPI.list()
        setSavedAdventures(adventures)
      } catch (error) {
        console.error('Failed to load adventures:', error)
      }
    }
    if (!isLoading && isAuthenticated && user?.role !== 'pending') {
      loadSavedAdventures()
    }
  }, [isLoading, isAuthenticated, user?.role])

  // Show loading screen while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Sparkle className="w-16 h-16 text-primary animate-pulse mx-auto mb-4" weight="duotone" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={refreshUser} />
  }

  // Show pending screen if user role is pending
  if (user?.role === 'pending') {
    return <PendingUserScreen user={user} />
  }

  const createNewAdventure = () => {
    const newAdventure: Adventure = {
      id: crypto.randomUUID(),
      name: 'Untitled Adventure',
      stage: 'overview',
      overview: {
        pitch: '',
        themes: [],
        gmNotes: '',
        partyLevelAverage: 1,
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
    setShowStartScreen(false)
  }

  const continueAdventure = () => {
    setShowStartScreen(false)
  }

  const loadExistingAdventure = async (id: string) => {
    await loadAdventure(id)
    setShowStartScreen(false)
  }

  const updateAdventure = (updates: Partial<Adventure>) => {
    setAdventure((current: Adventure | null) => {
      if (!current) return null
      
      // Ensure structure always exists to prevent crashes
      const updatedAdventure = {
        ...current,
        ...updates,
        updatedAt: Date.now(),
      }
      
      // Ensure critical nested objects have defaults
      if (!updatedAdventure.overview) {
        updatedAdventure.overview = {
          pitch: '',
          themes: [],
          gmNotes: '',
          partyLevelAverage: 1,
          playerCount: 4,
          coreConflict: '',
          antagonistIds: [],
          antagonistGoals: '',
        }
      }
      
      if (!updatedAdventure.structure) {
        updatedAdventure.structure = {
          encounters: [],
          connections: [],
        }
      }
      
      return updatedAdventure
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
      case 'admin':
        return isAdmin ? <AdminView adventure={adventure} updateAdventure={updateAdventure} /> : null
      default:
        return null
    }
  }

  if (!adventure || showStartScreen) {
    const hasAdventures = adventure !== null || savedAdventures.length > 0

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
              
              <div className="flex flex-col gap-3 max-w-md mx-auto">
                {adventure && (
                  <Button 
                    variant="default"
                    size="lg" 
                    className="gap-2 w-full"
                    onClick={continueAdventure}
                  >
                    <Play className="w-5 h-5" weight="fill" />
                    Continue: {adventure.name}
                  </Button>
                )}
                
                <Button 
                  variant="secondary"
                  size="lg" 
                  className="gap-2 w-full"
                  onClick={createNewAdventure}
                >
                  <Sparkle weight="fill" />
                  New Adventure
                </Button>
                
                {savedAdventures.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Load Saved Adventure:</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {savedAdventures.map((adv) => (
                        <Button
                          key={adv.id}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2"
                          onClick={() => loadExistingAdventure(adv.id)}
                        >
                          <Scroll className="w-4 h-4" />
                          {adv.name}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(adv.updatedAt).toLocaleDateString()}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                // Hide admin tab for non-admin users
                if (key === 'admin' && !isAdmin) return null
                
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
