// engine/CityGenerator/RoadNetwork.ts
// Generates and renders road networks connecting districts and buildings

import { Container, Graphics } from 'pixi.js'
import type { DistrictPosition, BuildingPosition } from './types'
import type { District, Building } from '../../types/SeedTypes'

export interface RoadSegment {
    from: { x: number; y: number }
    to: { x: number; y: number }
    type: 'highway' | 'street'
}

// =============================================================================
// Road Generation
// =============================================================================

/**
 * Generate a road network connecting districts (highways) and buildings (streets).
 */
export function generateRoads(
    districts: District[],
    districtPositions: Map<string, DistrictPosition>,
    buildingPositions: Map<string, BuildingPosition>,
    getBuildings: (d: District) => Building[],
    seed: number
): RoadSegment[] {
    const segments: RoadSegment[] = []

    // 1. Highways: Connect district centers via MST + extras
    const districtCenters: { id: string; x: number; y: number }[] = []
    for (const district of districts) {
        const pos = districtPositions.get(district.spec.id)
        if (pos) {
            districtCenters.push({ id: district.spec.id, x: pos.x, y: pos.y })
        }
    }

    if (districtCenters.length > 1) {
        const highways = generateHighways(districtCenters, seed)
        segments.push(...highways)
    }

    // 2. Streets: Connect buildings within each district
    for (const district of districts) {
        const buildings = getBuildings(district)
        const districtPos = districtPositions.get(district.spec.id)
        if (!districtPos || buildings.length === 0) continue

        const streets = generateStreets(buildings, buildingPositions, districtPos)
        segments.push(...streets)
    }

    return segments
}

/**
 * Generate highways using MST + some extra edges.
 */
function generateHighways(
    centers: { id: string; x: number; y: number }[],
    seed: number
): RoadSegment[] {
    const segments: RoadSegment[] = []

    if (centers.length < 2) return segments

    // Build all edges sorted by distance
    const edges: { i: number; j: number; dist: number }[] = []
    for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
            const dx = centers[j].x - centers[i].x
            const dy = centers[j].y - centers[i].y
            edges.push({ i, j, dist: Math.sqrt(dx * dx + dy * dy) })
        }
    }
    edges.sort((a, b) => a.dist - b.dist)

    // Kruskal's MST using union-find
    const parent = centers.map((_, idx) => idx)
    const find = (x: number): number => {
        if (parent[x] !== x) parent[x] = find(parent[x])
        return parent[x]
    }
    const union = (a: number, b: number): boolean => {
        const pa = find(a), pb = find(b)
        if (pa === pb) return false
        parent[pa] = pb
        return true
    }

    const mstEdges: Set<string> = new Set()

    for (const edge of edges) {
        if (union(edge.i, edge.j)) {
            mstEdges.add(`${edge.i}-${edge.j}`)
            segments.push({
                from: { x: centers[edge.i].x, y: centers[edge.i].y },
                to: { x: centers[edge.j].x, y: centers[edge.j].y },
                type: 'highway',
            })
        }
    }

    // Add ~30% extra edges for realism (non-MST short connections)
    const extraCount = Math.max(1, Math.floor(centers.length * 0.3))
    let added = 0
    const hash = (n: number) => Math.sin(n * 127.1 + seed) * 43758.5453

    for (const edge of edges) {
        if (added >= extraCount) break
        const key = `${edge.i}-${edge.j}`
        if (mstEdges.has(key)) continue

        // Probabilistic based on distance — prefer shorter edges
        const prob = hash(edge.i * 1000 + edge.j + seed)
        if ((prob - Math.floor(prob)) < 0.5) {
            segments.push({
                from: { x: centers[edge.i].x, y: centers[edge.i].y },
                to: { x: centers[edge.j].x, y: centers[edge.j].y },
                type: 'highway',
            })
            added++
        }
    }

    return segments
}

/**
 * Generate streets connecting buildings inside a district.
 */
function generateStreets(
    buildings: Building[],
    buildingPositions: Map<string, BuildingPosition>,
    districtPos: DistrictPosition
): RoadSegment[] {
    const segments: RoadSegment[] = []

    // Collect positioned buildings
    const positioned = buildings
        .map(b => {
            const pos = buildingPositions.get(b.spec.id)
            return pos ? { building: b, x: pos.x, y: pos.y } : null
        })
        .filter(Boolean) as { building: Building; x: number; y: number }[]

    if (positioned.length === 0) return segments

    // Connect the closest building to district center
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < positioned.length; i++) {
        const dx = positioned[i].x - districtPos.x
        const dy = positioned[i].y - districtPos.y
        const dist = dx * dx + dy * dy
        if (dist < closestDist) {
            closestDist = dist
            closestIdx = i
        }
    }

    segments.push({
        from: { x: districtPos.x, y: districtPos.y },
        to: { x: positioned[closestIdx].x, y: positioned[closestIdx].y },
        type: 'street',
    })

    // Connect each building to its nearest neighbor (simple nearest-neighbor chain)
    const connected = new Set<number>([closestIdx])
    const remaining = new Set<number>(positioned.map((_, i) => i))
    remaining.delete(closestIdx)

    while (remaining.size > 0) {
        let bestFrom = -1
        let bestTo = -1
        let bestDist = Infinity

        for (const from of connected) {
            for (const to of remaining) {
                const dx = positioned[to].x - positioned[from].x
                const dy = positioned[to].y - positioned[from].y
                const dist = dx * dx + dy * dy
                if (dist < bestDist) {
                    bestDist = dist
                    bestFrom = from
                    bestTo = to
                }
            }
        }

        if (bestTo === -1) break

        segments.push({
            from: { x: positioned[bestFrom].x, y: positioned[bestFrom].y },
            to: { x: positioned[bestTo].x, y: positioned[bestTo].y },
            type: 'street',
        })

        connected.add(bestTo)
        remaining.delete(bestTo)
    }

    return segments
}

// =============================================================================
// Road Rendering
// =============================================================================

/**
 * Render all road segments into a Container.
 * Roads use L-shaped (Manhattan) routing — horizontal then vertical.
 */
export function renderRoads(segments: RoadSegment[]): Container {
    const container = new Container()
    container.label = 'Roads'

    // Draw streets first (below highways)
    const streetGfx = new Graphics()
    const highwayGfx = new Graphics()
    const highwayCenterLine = new Graphics()

    for (const seg of segments) {
        if (seg.type === 'street') {
            drawLShapedPath(streetGfx, seg.from.x, seg.from.y, seg.to.x, seg.to.y)
        }
    }
    streetGfx.stroke({ width: 4, color: 0x3a3a3a, alpha: 0.7 })
    container.addChild(streetGfx)

    // Draw highways
    for (const seg of segments) {
        if (seg.type === 'highway') {
            drawLShapedPath(highwayGfx, seg.from.x, seg.from.y, seg.to.x, seg.to.y)
        }
    }
    highwayGfx.stroke({ width: 8, color: 0x4a4a4a, alpha: 0.8 })
    container.addChild(highwayGfx)

    // Draw center dashed lines on highways
    for (const seg of segments) {
        if (seg.type === 'highway') {
            // Horizontal segment
            drawDashedLine(highwayCenterLine, seg.from.x, seg.from.y, seg.to.x, seg.from.y, 12, 8)
            // Vertical segment
            drawDashedLine(highwayCenterLine, seg.to.x, seg.from.y, seg.to.x, seg.to.y, 12, 8)
        }
    }
    highwayCenterLine.stroke({ width: 1.5, color: 0x888888, alpha: 0.5 })
    container.addChild(highwayCenterLine)

    return container
}

/**
 * Draw an L-shaped path: horizontal first, then vertical.
 */
function drawLShapedPath(g: Graphics, x1: number, y1: number, x2: number, y2: number) {
    g.moveTo(x1, y1)
    g.lineTo(x2, y1) // horizontal
    g.lineTo(x2, y2) // vertical
}

function drawDashedLine(
    g: Graphics,
    x1: number, y1: number,
    x2: number, y2: number,
    dashLen: number, gapLen: number
) {
    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist === 0) return

    const nx = dx / dist
    const ny = dy / dist
    let pos = 0

    while (pos < dist) {
        const endPos = Math.min(pos + dashLen, dist)
        g.moveTo(x1 + nx * pos, y1 + ny * pos)
        g.lineTo(x1 + nx * endPos, y1 + ny * endPos)
        pos = endPos + gapLen
    }
}
