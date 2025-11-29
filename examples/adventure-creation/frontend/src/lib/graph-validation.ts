import { Encounter, EncounterConnection, StructureData } from '@/types/adventure'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  metrics: {
    totalEncounters: number
    totalConnections: number
    avgConnectionsPerEncounter: number
    deadEnds: number
    isolatedEncounters: number
    terminalEncounters: number
    branches: number
  }
}

function buildAdjacencyList(encounters: Encounter[], connections: EncounterConnection[]): Map<string, Set<string>> {
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()

  encounters.forEach(encounter => {
    outgoing.set(encounter.id, new Set())
    incoming.set(encounter.id, new Set())
  })

  connections.forEach(conn => {
    outgoing.get(conn.from)?.add(conn.to)
    incoming.get(conn.to)?.add(conn.from)
  })

  return outgoing
}

function buildReverseAdjacencyList(encounters: Encounter[], connections: EncounterConnection[]): Map<string, Set<string>> {
  const incoming = new Map<string, Set<string>>()

  encounters.forEach(encounter => {
    incoming.set(encounter.id, new Set())
  })

  connections.forEach(conn => {
    incoming.get(conn.to)?.add(conn.from)
  })

  return incoming
}

function findRootEncounters(encounters: Encounter[], connections: EncounterConnection[]): string[] {
  const incoming = buildReverseAdjacencyList(encounters, connections)
  return encounters.filter(encounter => incoming.get(encounter.id)!.size === 0).map(b => b.id)
}

function findTerminalEncounters(encounters: Encounter[], connections: EncounterConnection[]): string[] {
  const outgoing = buildAdjacencyList(encounters, connections)
  return encounters.filter(encounter => outgoing.get(encounter.id)!.size === 0).map(b => b.id)
}

function findIsolatedEncounters(encounters: Encounter[], connections: EncounterConnection[]): string[] {
  const outgoing = buildAdjacencyList(encounters, connections)
  const incoming = buildReverseAdjacencyList(encounters, connections)
  
  return encounters.filter(encounter => 
    outgoing.get(encounter.id)!.size === 0 && incoming.get(encounter.id)!.size === 0
  ).map(b => b.id)
}

function countBranches(encounters: Encounter[], connections: EncounterConnection[]): number {
  const outgoing = buildAdjacencyList(encounters, connections)
  let branches = 0
  
  outgoing.forEach(neighbors => {
    if (neighbors.size > 1) {
      branches += neighbors.size - 1
    }
  })
  
  return branches
}

function isGraphConnected(encounters: Encounter[], connections: EncounterConnection[]): boolean {
  if (encounters.length === 0) return true
  if (encounters.length === 1) return true

  const outgoing = buildAdjacencyList(encounters, connections)
  const incoming = buildReverseAdjacencyList(encounters, connections)
  
  const visited = new Set<string>()
  const queue: string[] = []
  
  const roots = findRootEncounters(encounters, connections)
  if (roots.length > 0) {
    queue.push(roots[0])
  } else {
    queue.push(encounters[0].id)
  }
  
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    
    visited.add(current)
    
    outgoing.get(current)?.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        queue.push(neighbor)
      }
    })
    
    incoming.get(current)?.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        queue.push(neighbor)
      }
    })
  }
  
  return visited.size === encounters.length
}

export function validateStructure(structure: StructureData, structureType: 'act-based' | 'branching' | 'sandbox' | 'decide-later'): ValidationResult {
  const { encounters, connections } = structure
  const errors: string[] = []
  const warnings: string[] = []

  if (encounters.length === 0) {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      metrics: {
        totalEncounters: 0,
        totalConnections: 0,
        avgConnectionsPerEncounter: 0,
        deadEnds: 0,
        isolatedEncounters: 0,
        terminalEncounters: 0,
        branches: 0
      }
    }
  }

  const outgoing = buildAdjacencyList(encounters, connections)
  const incoming = buildReverseAdjacencyList(encounters, connections)
  const isolated = findIsolatedEncounters(encounters, connections)
  const terminals = findTerminalEncounters(encounters, connections)
  const branches = countBranches(encounters, connections)

  const totalConnections = connections.length
  const avgConnectionsPerEncounter = encounters.length > 0 ? totalConnections / encounters.length : 0
  const deadEnds = terminals.length

  if (isolated.length > 0) {
    errors.push(`Found ${isolated.length} isolated encounter(s) with no connections`)
  }

  if (!isGraphConnected(encounters, connections) && encounters.length > 1) {
    errors.push('Structure graph is not connected - some encounters are unreachable')
  }

  const nonTerminalWithoutOutgoing = encounters.filter(encounter => {
    const isTerminal = terminals.includes(encounter.id)
    const hasOutgoing = outgoing.get(encounter.id)!.size > 0
    return !isTerminal && !hasOutgoing && incoming.get(encounter.id)!.size > 0
  })

  if (nonTerminalWithoutOutgoing.length > 0) {
    warnings.push(`${nonTerminalWithoutOutgoing.length} non-terminal encounter(s) don't lead anywhere`)
  }

  if (structureType !== 'decide-later') {
    if (structureType === 'act-based') {
      if (branches > 0) {
        warnings.push('Linear structure should not have branches')
      }

      if (encounters.length > 1 && avgConnectionsPerEncounter < 0.9) {
        errors.push('Linear structure requires 1:1 connections between encounters')
      }

      const expectedConnections = Math.max(0, encounters.length - 1)
      if (connections.length !== expectedConnections) {
        errors.push(`Linear structure should have exactly ${expectedConnections} connection(s), found ${connections.length}`)
      }
    }

    if (structureType === 'branching') {
      const minBranchesExpected = Math.max(1, Math.floor(encounters.length / 4))
      if (branches < minBranchesExpected) {
        errors.push(`Branching structure should have at least ${minBranchesExpected} branch point(s), found ${branches}`)
      }

      if (avgConnectionsPerEncounter < 1.0) {
        errors.push('Branching structure requires higher connectivity (avg >= 1.0 connections per encounter)')
      }

      const maxIsolatedAllowed = 0
      if (isolated.length > maxIsolatedAllowed) {
        errors.push(`Branching structure should have no isolated encounters, found ${isolated.length}`)
      }
    }

    if (structureType === 'sandbox') {
      const minAvgConnections = 1.5
      if (avgConnectionsPerEncounter < minAvgConnections) {
        errors.push(`Sandbox structure requires high connectivity (avg >= ${minAvgConnections} connections per encounter), found ${avgConnectionsPerEncounter.toFixed(2)}`)
      }

      const minBranchesExpected = Math.max(2, Math.floor(encounters.length / 3))
      if (branches < minBranchesExpected) {
        errors.push(`Sandbox structure should have at least ${minBranchesExpected} branch point(s), found ${branches}`)
      }

      const maxIsolatedAllowed = 0
      if (isolated.length > maxIsolatedAllowed) {
        errors.push(`Sandbox structure should have no isolated encounters, found ${isolated.length}`)
      }

      const encountersWithMultipleConnections = Array.from(outgoing.values()).filter(neighbors => neighbors.size > 1).length
      const minMultiConnected = Math.max(1, Math.floor(encounters.length / 3))
      if (encountersWithMultipleConnections < minMultiConnected) {
        errors.push(`Sandbox structure needs at least ${minMultiConnected} encounters with multiple outgoing paths, found ${encountersWithMultipleConnections}`)
      }
    }
  }

  if (terminals.length === 0 && encounters.length > 1) {
    warnings.push('No terminal encounter found - structures typically end with an epilogue or resolution')
  }

  if (terminals.length > 3 && encounters.length < 15) {
    warnings.push(`High number of terminal encounters (${terminals.length}) may indicate disconnected story threads`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      totalEncounters: encounters.length,
      totalConnections: totalConnections,
      avgConnectionsPerEncounter: parseFloat(avgConnectionsPerEncounter.toFixed(2)),
      deadEnds: deadEnds,
      isolatedEncounters: isolated.length,
      terminalEncounters: terminals.length,
      branches
    }
  }
}

export function getStructureTypeRequirements(type: 'act-based' | 'branching' | 'sandbox' | 'decide-later'): string {
  switch (type) {
    case 'act-based':
      return `LINEAR STRUCTURE REQUIREMENTS:
- Each encounter connects to exactly one next encounter (1:1 connections)
- No branching paths - players follow a single storyline
- Forms a single chain from beginning to end
- Total connections should equal (encounters - 1)
- Example: Start → Investigation → Combat → Rest → Climax → Resolution`

    case 'branching':
      return `BRANCHING STRUCTURE REQUIREMENTS:
- Multiple paths and player choices throughout
- At least 1 branch point per 4 encounters (25% of encounters should offer choices)
- Average connectivity: >= 1.0 connections per encounter
- Some encounters lead to 2+ different next encounters
- Paths can reconverge later
- Example: Start → Choice A / Choice B → Consequences → Shared Climax`

    case 'sandbox':
      return `SANDBOX STRUCTURE REQUIREMENTS:
- Highly interconnected with many possible paths
- Average connectivity: >= 1.5 connections per encounter
- At least 1 branch point per 3 encounters (33%+ of encounters offer choices)
- At least 33% of encounters should have multiple outgoing connections
- Players can approach content in various orders
- Multiple ways to reach the same destination
- Rich web of connections enabling player agency
- Example: Hub → Location A/B/C/D → Any can lead to others → Final showdown accessible from multiple paths`

    case 'decide-later':
      return `DECIDE LATER - NO STRICT REQUIREMENTS:
- You can suggest an appropriate structure based on the adventure's needs
- Consider the adventure's themes, scope, and intended player experience
- Feel free to propose act-based (linear), branching, or sandbox structure as appropriate`

    default:
      return ''
  }
}
