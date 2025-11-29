import { Encounter, EncounterConnection } from '@/types/adventure'

const CARD_WIDTH = 200
const CARD_HEIGHT = 120
const HORIZONTAL_SPACING = 80
const VERTICAL_SPACING = 60
const GRID_SIZE = 20

export const CANVAS_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 3000,
  maxY: 2000,
}

export const PAN_MARGIN = 200

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 1

export function constrainPan(
  panX: number,
  panY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const worldWidth = CANVAS_BOUNDS.maxX - CANVAS_BOUNDS.minX + PAN_MARGIN * 2
  const worldHeight = CANVAS_BOUNDS.maxY - CANVAS_BOUNDS.minY + PAN_MARGIN * 2
  
  const scaledWorldWidth = worldWidth * scale
  const scaledWorldHeight = worldHeight * scale
  
  const minPanX = PAN_MARGIN * scale
  const maxPanX = viewportWidth - scaledWorldWidth + PAN_MARGIN * scale
  
  const minPanY = PAN_MARGIN * scale
  const maxPanY = viewportHeight - scaledWorldHeight + PAN_MARGIN * scale
  
  let clampedX = panX
  let clampedY = panY
  
  if (scaledWorldWidth <= viewportWidth) {
    clampedX = (viewportWidth - scaledWorldWidth) / 2
  } else {
    clampedX = Math.max(maxPanX, Math.min(minPanX, panX))
  }
  
  if (scaledWorldHeight <= viewportHeight) {
    clampedY = (viewportHeight - scaledWorldHeight) / 2
  } else {
    clampedY = Math.max(maxPanY, Math.min(minPanY, panY))
  }
  
  return { x: clampedX, y: clampedY }
}

export function isPositionInBounds(x: number, y: number): boolean {
  return (
    x >= CANVAS_BOUNDS.minX &&
    x + CARD_WIDTH <= CANVAS_BOUNDS.maxX &&
    y >= CANVAS_BOUNDS.minY &&
    y + CARD_HEIGHT <= CANVAS_BOUNDS.maxY
  )
}

export function clampPositionToBounds(x: number, y: number): { x: number; y: number } {
  const clampedX = Math.max(
    CANVAS_BOUNDS.minX,
    Math.min(x, CANVAS_BOUNDS.maxX - CARD_WIDTH)
  )
  const clampedY = Math.max(
    CANVAS_BOUNDS.minY,
    Math.min(y, CANVAS_BOUNDS.maxY - CARD_HEIGHT)
  )
  return { x: clampedX, y: clampedY }
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

interface LayoutNode {
  id: string
  encounter: Encounter
  children: string[]
  parents: string[]
  level: number
  column: number
}

function buildGraph(encounters: Encounter[], connections: EncounterConnection[]): Map<string, LayoutNode> {
  const nodes = new Map<string, LayoutNode>()
  
  encounters.forEach(encounter => {
    nodes.set(encounter.id, {
      id: encounter.id,
      encounter,
      children: [],
      parents: [],
      level: 0,
      column: 0
    })
  })
  
  connections.forEach(conn => {
    const fromNode = nodes.get(conn.from)
    const toNode = nodes.get(conn.to)
    if (fromNode && toNode) {
      fromNode.children.push(conn.to)
      toNode.parents.push(conn.from)
    }
  })
  
  return nodes
}

function assignLevels(nodes: Map<string, LayoutNode>): void {
  const visited = new Set<string>()
  
  const rootNodes = Array.from(nodes.values()).filter(n => n.parents.length === 0)
  
  if (rootNodes.length === 0 && nodes.size > 0) {
    const firstNode = nodes.values().next().value
    firstNode.level = 0
    visited.add(firstNode.id)
    assignLevelsDFS(firstNode, nodes, visited)
  } else {
    rootNodes.forEach(root => {
      root.level = 0
      visited.add(root.id)
      assignLevelsDFS(root, nodes, visited)
    })
  }
  
  Array.from(nodes.values()).forEach(node => {
    if (!visited.has(node.id)) {
      node.level = 0
      visited.add(node.id)
      assignLevelsDFS(node, nodes, visited)
    }
  })
}

function assignLevelsDFS(node: LayoutNode, nodes: Map<string, LayoutNode>, visited: Set<string>): void {
  node.children.forEach(childId => {
    const child = nodes.get(childId)
    if (child && !visited.has(childId)) {
      child.level = node.level + 1
      visited.add(childId)
      assignLevelsDFS(child, nodes, visited)
    } else if (child && visited.has(childId)) {
      child.level = Math.max(child.level, node.level + 1)
    }
  })
}

function groupByLevel(nodes: Map<string, LayoutNode>): Map<number, LayoutNode[]> {
  const levels = new Map<number, LayoutNode[]>()
  
  nodes.forEach(node => {
    if (!levels.has(node.level)) {
      levels.set(node.level, [])
    }
    levels.get(node.level)!.push(node)
  })
  
  return levels
}

function assignColumns(levels: Map<number, LayoutNode[]>): void {
  levels.forEach(nodesAtLevel => {
    nodesAtLevel.forEach((node, index) => {
      node.column = index
    })
  })
}

function minimizeCrossings(levels: Map<number, LayoutNode[]>, maxIterations: number = 10): void {
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false
    
    const levelNumbers = Array.from(levels.keys()).sort((a, b) => a - b)
    
    for (let i = 0; i < levelNumbers.length; i++) {
      const level = levelNumbers[i]
      const nodesAtLevel = levels.get(level)!
      
      if (nodesAtLevel.length <= 1) continue
      
      const newOrder = [...nodesAtLevel]
      newOrder.sort((a, b) => {
        const aConnections = [...a.parents, ...a.children]
        const bConnections = [...b.parents, ...b.children]
        
        const aAvgCol = aConnections.reduce((sum, id) => {
          const otherLevel = levels.get(i - 1) || levels.get(i + 1)
          const node = otherLevel?.find(n => n.id === id)
          return sum + (node?.column || 0)
        }, 0) / (aConnections.length || 1)
        
        const bAvgCol = bConnections.reduce((sum, id) => {
          const otherLevel = levels.get(i - 1) || levels.get(i + 1)
          const node = otherLevel?.find(n => n.id === id)
          return sum + (node?.column || 0)
        }, 0) / (bConnections.length || 1)
        
        return aAvgCol - bAvgCol
      })
      
      for (let j = 0; j < newOrder.length; j++) {
        if (newOrder[j].column !== j) {
          changed = true
          newOrder[j].column = j
        }
      }
    }
    
    if (!changed) break
  }
}

function calculatePositions(nodes: Map<string, LayoutNode>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  
  const levels = groupByLevel(nodes)
  const maxLevel = Math.max(...Array.from(levels.keys()))
  
  // Calculate total width and height of the layout
  const totalWidth = (maxLevel + 1) * (CARD_WIDTH + HORIZONTAL_SPACING)
  const maxNodesInLevel = Math.max(...Array.from(levels.values()).map(nodes => nodes.length))
  const totalHeight = maxNodesInLevel * (CARD_HEIGHT + VERTICAL_SPACING)
  
  // Center the layout in the canvas
  const centerX = CANVAS_BOUNDS.maxX / 2
  const centerY = CANVAS_BOUNDS.maxY / 2
  const startX = centerX - totalWidth / 2
  const startY = centerY - totalHeight / 2
  
  nodes.forEach(node => {
    const x = snapToGrid(startX + node.level * (CARD_WIDTH + HORIZONTAL_SPACING))
    const nodesAtLevel = levels.get(node.level)!
    const levelHeight = nodesAtLevel.length * (CARD_HEIGHT + VERTICAL_SPACING)
    const levelStartY = startY + (totalHeight - levelHeight) / 2
    const y = snapToGrid(levelStartY + node.column * (CARD_HEIGHT + VERTICAL_SPACING))
    
    const clampedPos = clampPositionToBounds(x, y)
    positions.set(node.id, clampedPos)
  })
  
  return positions
}

function adjustForOverlaps(positions: Map<string, { x: number; y: number }>): void {
  const posArray = Array.from(positions.entries())
  const OVERLAP_THRESHOLD = 30
  
  for (let i = 0; i < posArray.length; i++) {
    for (let j = i + 1; j < posArray.length; j++) {
      const [id1, pos1] = posArray[i]
      const [id2, pos2] = posArray[j]
      
      const xOverlap = Math.abs(pos1.x - pos2.x) < CARD_WIDTH + OVERLAP_THRESHOLD
      const yOverlap = Math.abs(pos1.y - pos2.y) < CARD_HEIGHT + OVERLAP_THRESHOLD
      
      if (xOverlap && yOverlap) {
        const offsetY = snapToGrid(CARD_HEIGHT + VERTICAL_SPACING)
        const newY = pos2.y + offsetY
        const clamped = clampPositionToBounds(pos2.x, newY)
        positions.set(id2, clamped)
        posArray[j][1] = clamped
      }
    }
  }
}

export function autoLayoutEncounters(
  encounters: Encounter[],
  connections: EncounterConnection[]
): Encounter[] {
  if (encounters.length === 0) return encounters
  
  if (encounters.length === 1) {
    const pos = clampPositionToBounds(100, 100)
    return [{ ...encounters[0], position: pos }]
  }
  
  const nodes = buildGraph(encounters, connections)
  
  assignLevels(nodes)
  
  const levels = groupByLevel(nodes)
  assignColumns(levels)
  
  minimizeCrossings(levels, 20)
  
  let positions = calculatePositions(nodes)
  
  adjustForOverlaps(positions)
  
  return encounters.map(encounter => {
    const pos = positions.get(encounter.id) || encounter.position
    return {
      ...encounter,
      position: pos
    }
  })
}

export function calculateEncountersBoundingBox(encounters: Encounter[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  centerX: number
  centerY: number
} | null {
  if (encounters.length === 0) {
    return null
  }
  
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  
  encounters.forEach(encounter => {
    minX = Math.min(minX, encounter.position.x)
    minY = Math.min(minY, encounter.position.y)
    maxX = Math.max(maxX, encounter.position.x + CARD_WIDTH)
    maxY = Math.max(maxY, encounter.position.y + CARD_HEIGHT)
  })
  
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  }
}
