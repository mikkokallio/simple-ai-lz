import { useState, useRef, useEffect } from 'react'
import { Adventure, Encounter, EncounterType } from '@/types/adventure'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { 
  Plus,
  Minus,
  ArrowsOutCardinal,
  MagicWand,
  Trash,
  CaretRight,
  CaretLeft,
  Warning
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import STRUCTURE_TEMPLATES_DATA from '@/data/structure-templates.json'
import { 
  autoLayoutEncounters, 
  clampPositionToBounds, 
  snapToGrid, 
  isPositionInBounds,
  constrainPan,
  calculateEncountersBoundingBox,
  CANVAS_BOUNDS,
  PAN_MARGIN,
  MIN_ZOOM,
  MAX_ZOOM
} from '@/lib/layout-algorithm'
import { crToXP } from '@/lib/encounterCalculator'
import { toast } from 'sonner'
import { ENCOUNTER_TEMPLATES, getEncounterTemplate, type EncounterType, type EncounterTemplate } from '@/lib/encounter-templates'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface StructureStageProps {
  adventure: Adventure
  updateAdventure: (updates: Partial<Adventure>) => void
}

const GRID_SIZE = 20
const CARD_WIDTH = 160
const CARD_HEIGHT = 160

export default function StructureStage({ adventure, updateAdventure }: StructureStageProps) {
  const [selectedEncounter, setSelectedEncounter] = useState<Encounter | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('empty')
  const [connectingFrom, setConnectingFrom] = useState<{ encounterId: string; side: 'left' | 'right' } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedEncounter, setDraggedEncounter] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [isDraggingEncounter, setIsDraggingEncounter] = useState(false)
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  
  const canvasRef = useRef<HTMLDivElement>(null)

  const calculateEncounterXP = (encounter: Encounter) => {
    if (encounter.type === 'combat') {
      const creatureRefs = (window as any).creatureReferences || []
      const encounterCreatures = encounter.creatures.map(creatureId => {
        const npc = adventure.npcs.find(n => n.id === creatureId)
        if (npc?.creature) return npc.creature.cr
        const creatureRef = creatureRefs.find((c: any) => c.id === creatureId)
        if (creatureRef?.creature) return creatureRef.creature.cr
        return null
      }).filter(cr => cr !== null)
      
      return encounterCreatures.reduce((total, cr) => total + crToXP(cr), 0)
    } else {
      return encounter.storyXP || 0
    }
  }

  const addEncounterToCanvas = (template: EncounterTemplate, clientX: number, clientY: number) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const canvasX = (clientX - rect.left - pan.x) / scale
    const canvasY = (clientY - rect.top - pan.y) / scale
    const x = snapToGrid(canvasX)
    const y = snapToGrid(canvasY)

    if (!isPositionInBounds(x, y)) {
      toast.error('Cannot place card outside canvas boundaries')
      return
    }

    const newEncounter: Encounter = {
      id: crypto.randomUUID(),
      title: template.defaultTitle,
      description: '',
      type: template.type,
      linkedFactions: [],
      linkedLocations: [],
      position: { x, y },
      difficulty: 5,
      creatures: [],
      npcs: [],
      stakes: '',
      consequences: '',
      rewardIds: [],
      importantChecks: [],
      storyXP: 0,
      durationMinutes: 30
    }

    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: [...adventure.structure.encounters, newEncounter]
      }
    })
  }

  const updateEncounter = (encounterId: string, updates: Partial<Encounter>) => {
    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: adventure.structure.encounters.map(e => 
          e.id === encounterId ? { ...e, ...updates } : e
        )
      }
    })
  }

  const deleteEncounter = (encounterId: string) => {
    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: adventure.structure.encounters.filter(e => e.id !== encounterId),
        connections: adventure.structure.connections.filter(
          c => c.from !== encounterId && c.to !== encounterId
        )
      }
    })
    setEditDialogOpen(false)
  }

  const handleEncounterDragStart = (e: React.DragEvent, encounterId: string) => {
    setDraggedEncounter(encounterId)
    setIsDragging(true)
    setIsDraggingEncounter(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('existing-encounter', encounterId)
  }

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    const encounterType = e.dataTransfer.types.includes('encounter-type')
    e.dataTransfer.dropEffect = encounterType ? 'copy' : 'move'
  }

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!canvasRef.current) return

    const encounterType = e.dataTransfer.getData('encounter-type')
    const existingEncounter = e.dataTransfer.getData('existing-encounter')

    const rect = canvasRef.current.getBoundingClientRect()
    const canvasX = ((e.clientX - rect.left) - pan.x) / scale - CARD_WIDTH / 2
    const canvasY = ((e.clientY - rect.top) - pan.y) / scale - CARD_HEIGHT / 2
    const x = snapToGrid(canvasX)
    const y = snapToGrid(canvasY)

    if (!isPositionInBounds(x, y)) {
      toast.error('Cannot place card outside canvas boundaries')
      setDraggedEncounter(null)
      setIsDragging(false)
      setIsDraggingEncounter(false)
      return
    }

    if (encounterType) {
      const template = ENCOUNTER_TEMPLATES.find(t => t.type === encounterType)
      if (template) {
        const newEncounter: Encounter = {
          id: crypto.randomUUID(),
          title: template.defaultTitle,
          description: '',
          type: template.type,
          linkedFactions: [],
          linkedLocations: [],
          position: { x, y },
          difficulty: 5,
          creatures: [],
          npcs: [],
          stakes: '',
          consequences: '',
          rewardIds: [],
          importantChecks: [],
          storyXP: 0,
          durationMinutes: 30
        }

        updateAdventure({
          structure: {
            ...adventure.structure,
            encounters: [...adventure.structure.encounters, newEncounter]
          }
        })
      }
    } else if (existingEncounter) {
      updateEncounter(existingEncounter, { position: { x, y } })
    }

    setDraggedEncounter(null)
    setIsDragging(false)
    setIsDraggingEncounter(false)
  }

  const toggleConnection = (fromId: string, toId: string, fromSide: 'left' | 'right', toSide: 'left' | 'right') => {
    if (fromSide !== 'right' || toSide !== 'left') {
      toast.error('Connections must go from right node to left node only')
      return
    }

    const existingConnection = adventure.structure.connections.find(
      c => c.from === fromId && c.to === toId
    )

    if (existingConnection) {
      updateAdventure({
        structure: {
          ...adventure.structure,
          connections: adventure.structure.connections.filter(
            c => !(c.from === fromId && c.to === toId)
          )
        }
      })
    } else {
      updateAdventure({
        structure: {
          ...adventure.structure,
          connections: [
            ...adventure.structure.connections,
            { from: fromId, to: toId, fromSide, toSide }
          ]
        }
      })
    }
  }

  const handleEncounterClick = (encounter: Encounter, clickedSide?: 'left' | 'right') => {
    if (connectingFrom) {
      if (connectingFrom.encounterId !== encounter.id && clickedSide) {
        toggleConnection(connectingFrom.encounterId, encounter.id, connectingFrom.side, clickedSide)
      }
      setConnectingFrom(null)
    } else {
      setSelectedEncounter(encounter)
      setEditDialogOpen(true)
    }
  }

  const startConnection = (e: React.MouseEvent, encounterId: string, side: 'left' | 'right') => {
    e.stopPropagation()
    if (side === 'left') {
      toast.error('Connections can only start from right nodes')
      return
    }
    setConnectingFrom({ encounterId, side })
  }

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const isClickOnEncounter = target.closest('[data-encounter-card]')
    const isClickOnSocket = target.closest('[data-socket]')
    
    if (!isClickOnEncounter && !isClickOnSocket && !isDraggingEncounter) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
      e.preventDefault()
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const newPanX = e.clientX - panStart.x
      const newPanY = e.clientY - panStart.y
      
      const constrained = constrainPan(newPanX, newPanY, scale, rect.width, rect.height)
      setPan(constrained)
    }
  }

  const handleCanvasMouseUp = () => {
    setIsPanning(false)
    setIsDraggingEncounter(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      setLastPinchDistance(distance)
      e.preventDefault()
    } else if (e.touches.length === 1) {
      const touch = e.touches[0]
      const target = e.target as HTMLElement
      const isClickOnEncounter = target.closest('[data-encounter-card]')
      const isClickOnSocket = target.closest('[data-socket]')
      
      if (!isClickOnEncounter && !isClickOnSocket && !isDraggingEncounter) {
        setIsPanning(true)
        setPanStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y })
        e.preventDefault()
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistance !== null && canvasRef.current) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      
      const rect = canvasRef.current.getBoundingClientRect()
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left
      const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top
      
      const worldX = (centerX - pan.x) / scale
      const worldY = (centerY - pan.y) / scale
      
      const delta = (distance - lastPinchDistance) * 0.01
      const newScale = Math.min(Math.max(MIN_ZOOM, scale + delta), MAX_ZOOM)
      
      const newPanX = centerX - worldX * newScale
      const newPanY = centerY - worldY * newScale
      
      const constrained = constrainPan(newPanX, newPanY, newScale, rect.width, rect.height)
      
      setPan(constrained)
      setScale(newScale)
      setLastPinchDistance(distance)
      e.preventDefault()
    } else if (isPanning && e.touches.length === 1 && canvasRef.current) {
      const touch = e.touches[0]
      const rect = canvasRef.current.getBoundingClientRect()
      const newPanX = touch.clientX - panStart.x
      const newPanY = touch.clientY - panStart.y
      
      const constrained = constrainPan(newPanX, newPanY, scale, rect.width, rect.height)
      setPan(constrained)
      e.preventDefault()
    }
  }

  const handleTouchEnd = () => {
    setIsPanning(false)
    setIsDraggingEncounter(false)
    setLastPinchDistance(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const worldX = (mouseX - pan.x) / scale
    const worldY = (mouseY - pan.y) / scale
    
    const delta = e.deltaY * -0.001
    const newScale = Math.min(Math.max(MIN_ZOOM, scale + delta), MAX_ZOOM)
    
    const newPanX = mouseX - worldX * newScale
    const newPanY = mouseY - worldY * newScale
    
    const constrained = constrainPan(newPanX, newPanY, newScale, rect.width, rect.height)
    
    setPan(constrained)
    setScale(newScale)
  }

  const handleAutoLayout = () => {
    if (adventure.structure.encounters.length === 0) {
      toast.error('No cards to layout')
      return
    }

    const layoutedEncounters = autoLayoutEncounters(
      adventure.structure.encounters,
      adventure.structure.connections
    )

    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: layoutedEncounters
      }
    })

    setTimeout(() => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      
      const bbox = calculateEncountersBoundingBox(layoutedEncounters)
      
      if (!bbox) {
        const centerX = (CANVAS_BOUNDS.maxX / 2)
        const centerY = (CANVAS_BOUNDS.maxY / 2)
        
        const newPanX = rect.width / 2 - centerX
        const newPanY = rect.height / 2 - centerY
        
        setPan({ x: newPanX, y: newPanY })
        setScale(1)
        return
      }
      
      const bboxWidth = bbox.maxX - bbox.minX
      const bboxHeight = bbox.maxY - bbox.minY
      
      const padding = 100
      const scaleX = rect.width / (bboxWidth + padding * 2)
      const scaleY = rect.height / (bboxHeight + padding * 2)
      const newScale = Math.min(Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)), MAX_ZOOM)
      
      const newPanX = rect.width / 2 - bbox.centerX * newScale
      const newPanY = rect.height / 2 - bbox.centerY * newScale
      
      const constrained = constrainPan(newPanX, newPanY, newScale, rect.width, rect.height)
      
      setPan(constrained)
      setScale(newScale)
    }, 50)

    toast.success('Cards reorganized for optimal layout')
  }

  const handleClearCanvas = () => {
    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: [],
        connections: []
      }
    })

    toast.success('Canvas cleared - ready to start fresh')
  }


  const STRUCTURE_TEMPLATES = STRUCTURE_TEMPLATES_DATA

  const handleResetWithTemplate = () => {
    const template = STRUCTURE_TEMPLATES.find(t => t.id === selectedTemplate)
    if (!template) return

    const newEncounters: Encounter[] = template.encounters.map((enc: any, idx: number) => ({
      id: crypto.randomUUID(),
      title: enc.title,
      description: enc.description || '',
      type: enc.type as EncounterType,
      actionSequenceType: enc.subtype && (enc.type === 'action-sequence') ? enc.subtype : undefined,
      discoveryType: enc.subtype && (enc.type === 'discovery') ? enc.subtype : undefined,
      linkedFactions: [],
      linkedLocations: [],
      position: enc.position,
      difficulty: 2,
      creatures: [],
      npcs: [],
      stakes: '',
      consequences: '',
      rewardIds: [],
      importantChecks: [],
      durationMinutes: enc.durationMinutes
    }))

    const idMap = new Map<number, string>()
    newEncounters.forEach((enc, idx) => {
      idMap.set(idx, enc.id)
    })

    const newConnections = template.connections.map(conn => ({
      from: idMap.get(conn.from)!,
      to: idMap.get(conn.to)!,
      fromSide: 'right' as const,
      toSide: 'left' as const
    }))

    updateAdventure({
      structure: {
        ...adventure.structure,
        encounters: newEncounters,
        connections: newConnections
      }
    })

    setResetDialogOpen(false)
    setSelectedTemplate('empty')
    toast.success(`Template "${template.name}" applied successfully`)
  }

  const getSelectedTemplateInfo = () => {
    const template = STRUCTURE_TEMPLATES.find(t => t.id === selectedTemplate)
    if (!template) return null
    
    const hours = Math.floor(template.totalDuration / 60)
    const minutes = template.totalDuration % 60
    let timeStr = ''
    if (hours > 0 && minutes > 0) {
      timeStr = `${hours}h ${minutes}m`
    } else if (hours > 0) {
      timeStr = `${hours}h`
    } else if (minutes > 0) {
      timeStr = `${minutes}m`
    } else {
      timeStr = 'No encounters'
    }
    
    return { ...template, timeStr }
  }

  const renderConnections = () => {
    return adventure.structure.connections.map((conn, idx) => {
      const fromEncounter = adventure.structure.encounters.find(e => e.id === conn.from)
      const toEncounter = adventure.structure.encounters.find(e => e.id === conn.to)
      
      if (!fromEncounter || !toEncounter) return null

      const fromSide = conn.fromSide || 'right'
      const toSide = conn.toSide || 'left'

      const x1 = (fromSide === 'right' 
        ? fromEncounter.position.x + CARD_WIDTH
        : fromEncounter.position.x) + PAN_MARGIN
      const y1 = fromEncounter.position.y + CARD_HEIGHT / 2 + PAN_MARGIN

      const x2 = (toSide === 'right'
        ? toEncounter.position.x + CARD_WIDTH
        : toEncounter.position.x) + PAN_MARGIN
      const y2 = toEncounter.position.y + CARD_HEIGHT / 2 + PAN_MARGIN

      return (
        <line
          key={idx}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="oklch(0.40 0.05 280)"
          strokeWidth="2"
        />
      )
    })
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="mb-1">Adventure Structure</h2>
          <p className="text-sm text-muted-foreground">
            {connectingFrom 
              ? 'Click a left node on another card to connect' 
              : 'Drag cards from the library onto the canvas. Click right nodes to start connections to left nodes.'
            }
          </p>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <Button 
            variant="secondary" 
            size="sm"
            className="gap-2 border-destructive/50 hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setResetDialogOpen(true)}
          >
            <Trash className="w-4 h-4" />
            Reset
          </Button>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Reset Structure</DialogTitle>
              <DialogDescription>
                Choose a template to reset your adventure structure. This will replace all existing encounters and connections.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="template">Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="bg-secondary/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRUCTURE_TEMPLATES.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {getSelectedTemplateInfo() && (
                <div className="space-y-2">
                  <div className="p-3 rounded-md bg-secondary/30 border border-border">
                    <p className="text-sm font-medium mb-1">{getSelectedTemplateInfo()!.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Estimated Duration: {getSelectedTemplateInfo()!.timeStr}
                    </p>
                  </div>
                  {adventure.structure.encounters.length > 0 && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                      <Warning className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-destructive">
                        Warning: This will delete all {adventure.structure.encounters.length} existing encounter{adventure.structure.encounters.length !== 1 ? 's' : ''} and connections. This action cannot be undone.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResetDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleResetWithTemplate}>
                Reset
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {adventure.structure.encounters.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[oklch(0.35_0.08_300)]/10 border border-[oklch(0.35_0.08_300)]/30">
              <span className="text-xs font-medium text-foreground">
                Total Duration: {(() => {
                  const totalMinutes = adventure.structure.encounters.reduce((total, enc) => total + (enc.durationMinutes || 30), 0)
                  const hours = Math.floor(totalMinutes / 60)
                  const minutes = totalMinutes % 60
                  if (hours > 0 && minutes > 0) {
                    return `${hours}h ${minutes}m`
                  } else if (hours > 0) {
                    return `${hours}h`
                  } else {
                    return `${minutes}m`
                  }
                })()}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[oklch(0.35_0.08_300)]/10 border border-[oklch(0.35_0.08_300)]/30">
              <span className="text-xs font-medium text-foreground">
                Zoom: {Math.round(scale * 100)}%
              </span>
            </div>
          </>
        )}
        <div className="flex-1" />
        <Button 
          variant="secondary" 
          size="sm"
          onClick={handleAutoLayout}
          className="gap-2"
          disabled={adventure.structure.encounters.length === 0}
        >
          <MagicWand className="w-4 h-4" />
          Auto-Layout
        </Button>
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => {
            if (!canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            const centerX = rect.width / 2
            const centerY = rect.height / 2
            
            const worldX = (centerX - pan.x) / scale
            const worldY = (centerY - pan.y) / scale
            
            const newScale = Math.min(MAX_ZOOM, scale + 0.1)
            
            const newPanX = centerX - worldX * newScale
            const newPanY = centerY - worldY * newScale
            
            const constrained = constrainPan(newPanX, newPanY, newScale, rect.width, rect.height)
            
            setPan(constrained)
            setScale(newScale)
          }}
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => {
            if (!canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            const centerX = rect.width / 2
            const centerY = rect.height / 2
            
            const worldX = (centerX - pan.x) / scale
            const worldY = (centerY - pan.y) / scale
            
            const newScale = Math.max(MIN_ZOOM, scale - 0.1)
            
            const newPanX = centerX - worldX * newScale
            const newPanY = centerY - worldY * newScale
            
            const constrained = constrainPan(newPanX, newPanY, newScale, rect.width, rect.height)
            
            setPan(constrained)
            setScale(newScale)
          }}
        >
          <Minus className="w-4 h-4" />
        </Button>
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => {
            if (!canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            
            const bbox = calculateEncountersBoundingBox(adventure.structure.encounters)
            
            if (!bbox) {
              const centerX = (CANVAS_BOUNDS.maxX / 2)
              const centerY = (CANVAS_BOUNDS.maxY / 2)
              
              const newPanX = rect.width / 2 - centerX
              const newPanY = rect.height / 2 - centerY
              
              setPan({ x: newPanX, y: newPanY })
              setScale(1)
              return
            }
            
            const bboxWidth = bbox.maxX - bbox.minX
            const bboxHeight = bbox.maxY - bbox.minY
            
            const padding = 100
            const scaleX = rect.width / (bboxWidth + padding * 2)
            const scaleY = rect.height / (bboxHeight + padding * 2)
            const newScale = Math.min(Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)), MAX_ZOOM)
            
            const newPanX = rect.width / 2 - bbox.centerX * newScale
            const newPanY = rect.height / 2 - bbox.centerY * newScale
            
            const constrained = constrainPan(newPanX, newPanY, newScale, rect.width, rect.height)
            
            setPan(constrained)
            setScale(newScale)
          }}
        >
          <ArrowsOutCardinal className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className={cn(
          "flex-shrink-0 border-2 overflow-hidden flex flex-col transition-all duration-300",
          libraryCollapsed ? "w-16" : "w-64"
        )}>
          <CardHeader className={cn(
            "pb-3 flex flex-row items-center relative",
            libraryCollapsed ? "justify-center px-0" : "justify-between pr-2"
          )}>
            {!libraryCollapsed && <CardTitle className="text-base">Card Library</CardTitle>}
            <div className={cn(
              "flex items-center justify-center",
              libraryCollapsed && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            )}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLibraryCollapsed(!libraryCollapsed)}
                className="h-8 w-8 p-0 hover:bg-accent/50"
              >
                {libraryCollapsed ? <CaretRight className="w-4 h-4" /> : <CaretLeft className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className={cn(
            "flex-1 overflow-y-auto space-y-2",
            libraryCollapsed ? "px-2" : "px-4"
          )}>
            <TooltipProvider delayDuration={200}>
              {ENCOUNTER_TEMPLATES.map(template => {
                const Icon = template.icon
                
                if (libraryCollapsed) {
                  return (
                    <Tooltip key={template.type}>
                      <TooltipTrigger asChild>
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'copy'
                            e.dataTransfer.setData('encounter-type', template.type)
                          }}
                          className={cn(
                            'p-2 rounded-lg border-2 cursor-grab active:cursor-grabbing',
                            'transition-all hover:scale-110 hover:shadow-lg',
                            'flex items-center justify-center',
                            template.bgColor
                          )}
                        >
                          <Icon className={cn('w-5 h-5', template.color)} weight="duotone" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="px-3 py-1.5 bg-muted border-2 border-[oklch(0.35_0.08_300)] rounded-md">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{template.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                }
                
                return (
                  <div
                    key={template.type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData('encounter-type', template.type)
                    }}
                    className={cn(
                      'p-3 rounded-lg border-2 cursor-grab active:cursor-grabbing',
                      'transition-all hover:scale-105 hover:shadow-lg',
                      template.bgColor
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-5 h-5', template.color)} weight="duotone" />
                      <span className="text-sm font-bold uppercase tracking-wide">
                        {template.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </TooltipProvider>
          </CardContent>
        </Card>

        <Card 
          ref={canvasRef}
          className="flex-1 border-2 relative overflow-hidden bg-black touch-none"
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%'
            }}
          >
            <svg
              style={{
                position: 'absolute',
                top: -PAN_MARGIN,
                left: -PAN_MARGIN,
                width: CANVAS_BOUNDS.maxX + PAN_MARGIN * 2,
                height: CANVAS_BOUNDS.maxY + PAN_MARGIN * 2,
                pointerEvents: 'none',
                overflow: 'visible'
              }}
            >
              <defs>
                <pattern
                  id="grid-pattern"
                  width={GRID_SIZE}
                  height={GRID_SIZE}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${PAN_MARGIN}, ${PAN_MARGIN})`}
                >
                  <path
                    d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                    fill="none"
                    stroke="oklch(0.35 0.08 300 / 0.2)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              
              <rect
                x={PAN_MARGIN}
                y={PAN_MARGIN}
                width={CANVAS_BOUNDS.maxX}
                height={CANVAS_BOUNDS.maxY}
                fill="oklch(0.22 0.03 270)"
              />
              
              <rect
                x={PAN_MARGIN}
                y={PAN_MARGIN}
                width={CANVAS_BOUNDS.maxX}
                height={CANVAS_BOUNDS.maxY}
                fill="url(#grid-pattern)"
              />
              
              <rect
                x={PAN_MARGIN}
                y={PAN_MARGIN}
                width={CANVAS_BOUNDS.maxX}
                height={CANVAS_BOUNDS.maxY}
                fill="none"
                stroke="oklch(0.35 0.08 300 / 0.3)"
                strokeWidth="2"
                strokeDasharray="10 5"
              />
              {renderConnections()}
            </svg>

            {adventure.structure.encounters.map(encounter => {
              const template = getEncounterTemplate(encounter.type)
              const Icon = template.icon
              const isConnecting = connectingFrom?.encounterId === encounter.id
              const xp = calculateEncounterXP(encounter)
              
              return (
                <div
                  key={encounter.id}
                  data-encounter-card
                  draggable
                  onDragStart={(e) => handleEncounterDragStart(e, encounter.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEncounterClick(encounter)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className={cn(
                    'absolute p-3 rounded-lg border-2 cursor-move',
                    'transition-all hover:scale-105 hover:shadow-xl',
                    template.bgColor,
                    isConnecting && 'shadow-[0_0_16px_oklch(0.35_0.08_300_/_0.4)]'
                  )}
                  style={{
                    left: encounter.position.x,
                    top: encounter.position.y,
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT
                  }}
                >
                  <div
                    data-socket
                    className={cn(
                      'absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full',
                      'border-2 bg-card cursor-pointer z-10',
                      'transition-all',
                      connectingFrom && connectingFrom.side === 'right' && connectingFrom.encounterId !== encounter.id
                        ? 'border-[oklch(0.35_0.08_300)] shadow-[0_0_16px_6px_oklch(0.35_0.08_300_/_0.5)] bg-[oklch(0.35_0.08_300)]/30 scale-125 animate-pulse'
                        : 'border-[oklch(0.35_0.08_300)]/30 hover:border-[oklch(0.35_0.08_300)] hover:bg-[oklch(0.35_0.08_300)]/10 hover:scale-110'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (connectingFrom) {
                        if (connectingFrom.encounterId !== encounter.id) {
                          toggleConnection(connectingFrom.encounterId, encounter.id, connectingFrom.side, 'left')
                        }
                        setConnectingFrom(null)
                      } else {
                        toast.error('Connections can only start from right nodes')
                      }
                    }}
                  />

                  <div
                    data-socket
                    className={cn(
                      'absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full',
                      'border-2 border-[oklch(0.35_0.08_300)] bg-card cursor-pointer z-10',
                      'transition-all hover:scale-110',
                      connectingFrom?.encounterId === encounter.id && connectingFrom?.side === 'right' 
                        ? 'shadow-[0_0_12px_4px_oklch(0.35_0.08_300_/_0.6)] bg-[oklch(0.35_0.08_300)]/20' 
                        : 'hover:bg-[oklch(0.35_0.08_300)]/10'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (connectingFrom) {
                        if (connectingFrom.encounterId !== encounter.id) {
                          toggleConnection(connectingFrom.encounterId, encounter.id, connectingFrom.side, 'right')
                        }
                        setConnectingFrom(null)
                      } else {
                        startConnection(e, encounter.id, 'right')
                      }
                    }}
                  />

                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-center h-1/3 px-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-center line-clamp-2">
                        {encounter.title}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-center h-1/3">
                      <Icon className={cn('w-8 h-8', template.color)} weight="duotone" />
                    </div>
                    
                    <div className="flex items-end justify-between gap-2 h-1/3 px-2 pb-2">
                      <Badge variant="purple" className="text-[10px] px-2 py-0.5 uppercase tracking-wider">
                        {encounter.durationMinutes || 30}<span className="lowercase">m</span>
                      </Badge>
                      <Badge variant="golden" className="text-[10px] px-2 py-0.5">
                        {xp} XP
                      </Badge>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">Edit Encounter</DialogTitle>
            <DialogDescription className="text-center">
              Configure this encounter - use the Encounters page for detailed editing
            </DialogDescription>
          </DialogHeader>
          
          {selectedEncounter && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Title</label>
                <Input
                  value={selectedEncounter.title}
                  onChange={(e) => {
                    const updated = { ...selectedEncounter, title: e.target.value }
                    setSelectedEncounter(updated)
                    updateEncounter(selectedEncounter.id, { title: e.target.value })
                  }}
                  placeholder="Encounter title"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description</label>
                <Textarea
                  value={selectedEncounter.description}
                  onChange={(e) => {
                    const updated = { ...selectedEncounter, description: e.target.value }
                    setSelectedEncounter(updated)
                    updateEncounter(selectedEncounter.id, { description: e.target.value })
                  }}
                  placeholder="Describe what happens in this encounter..."
                  rows={4}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => deleteEncounter(selectedEncounter.id)}
                >
                  Delete Encounter
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setEditDialogOpen(false)}
                  className="ml-auto"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
