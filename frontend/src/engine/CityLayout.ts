// engine/CityLayout.ts
// City layout system with Guillotine Packing Algorithm for realistic city blocks

import { Rectangle } from 'pixi.js'
import type { District, Building } from '../types/SeedTypes'
import { SeededRandom } from './SeededRandom'

type Direction = 'north' | 'south' | 'east' | 'west'

export interface DistrictNode {
    data: District
    bounds: {
        x: number
        y: number
        width: number
        height: number
    }
    color: number
}

export interface BuildingPlacement {
    building: Building
    bounds: Rectangle
    facing: Direction
}

export class CityLayout {
    private rng: SeededRandom
    private alleyWidth = 100  // Narrow gaps between buildings
    private minSplitSize = 200  // Minimum size for splitting - prevents sliver artifacts

    constructor(rng: SeededRandom) {
        this.rng = rng
    }

    /**
     * Generate an organic city map using BSP for districts.
     */
    generateMap(districts: District[], width: number, height: number): DistrictNode[] {
        if (districts.length === 0) return []

        const nodes: DistrictNode[] = []
        const bounds = { x: 0, y: 0, width, height }

        // Recursively split the space
        const splits = this.bspSplit(bounds, districts.length, 0)

        // Assign districts to splits
        districts.forEach((district, i) => {
            const split = splits[i % splits.length]

            // Add some padding inside the split
            const margin = 15
            // Ensure width/height never go negative
            const innerBounds = {
                x: split.x + margin,
                y: split.y + margin,
                width: Math.max(1, split.width - margin * 2),
                height: Math.max(1, split.height - margin * 2),
            }

            nodes.push({
                data: district,
                bounds: innerBounds,
                color: this.getDistrictColor(district, i),
            })
        })

        return nodes
    }

    /**
     * Binary space partitioning - recursively split rectangles.
     * Now with minimum size checks to prevent sliver artifacts.
     */
    private bspSplit(
        rect: { x: number; y: number; width: number; height: number },
        numSplits: number,
        depth: number = 0
    ): { x: number; y: number; width: number; height: number }[] {
        if (numSplits <= 1 || depth > 4) {
            return [rect]
        }

        // Check if splitting is actually viable
        const canSplitVertical = rect.width > this.minSplitSize * 2
        const canSplitHorizontal = rect.height > this.minSplitSize * 2

        // If we can't split comfortably, return the whole rect
        // This prevents creating thin "sliver" districts
        if (!canSplitVertical && !canSplitHorizontal) {
            return [rect]
        }

        // Decide direction:
        // - If one way is impossible, force the other
        // - If both possible, favor the longer axis
        let horizontal = false
        if (!canSplitVertical) {
            horizontal = true
        } else if (!canSplitHorizontal) {
            horizontal = false
        } else {
            horizontal = rect.height > rect.width
                ? this.rng.next() > 0.3
                : this.rng.next() > 0.7
        }

        const splitRatio = this.rng.range(0.35, 0.65)

        let rect1, rect2

        if (horizontal) {
            const splitHeight = Math.floor(rect.height * splitRatio)
            rect1 = { x: rect.x, y: rect.y, width: rect.width, height: splitHeight }
            rect2 = { x: rect.x, y: rect.y + splitHeight, width: rect.width, height: rect.height - splitHeight }
        } else {
            const splitWidth = Math.floor(rect.width * splitRatio)
            rect1 = { x: rect.x, y: rect.y, width: splitWidth, height: rect.height }
            rect2 = { x: rect.x + splitWidth, y: rect.y, width: rect.width - splitWidth, height: rect.height }
        }

        const half = Math.ceil(numSplits / 2)

        return [
            ...this.bspSplit(rect1, half, depth + 1),
            ...this.bspSplit(rect2, numSplits - half, depth + 1),
        ]
    }

    /**
     * Guillotine Packing Algorithm: Places buildings using space subdivision.
     * Large buildings (by LOC) get prime space, smaller ones fill gaps.
     */
    packBuildings(
        buildings: Building[],
        bounds: { x: number; y: number; width: number; height: number }
    ): BuildingPlacement[] {
        if (buildings.length === 0) return []

        const placements: BuildingPlacement[] = []

        // 1. Sort buildings by LOC (large buildings first for prime placement)
        const sorted = [...buildings].sort((a, b) => b.spec.loc - a.spec.loc)

        // 2. Initialize free spaces with the entire district
        // Shrink slightly to create outer margin
        const margin = 10
        let freeSpaces: Rectangle[] = [
            new Rectangle(
                bounds.x + margin,
                bounds.y + margin + 40, // Leave space for district label
                bounds.width - margin * 2,
                bounds.height - margin * 2 - 40
            )
        ]

        // 3. Place each building using Best-Fit heuristic
        for (const building of sorted) {
            // Calculate desired size based on LOC
            const size = Math.min(120, Math.max(50, 60 + building.spec.loc * 0.05))

            // Find the best-fitting free space
            let bestSpaceIndex = -1
            let bestScore = Number.MAX_VALUE

            for (let i = 0; i < freeSpaces.length; i++) {
                const space = freeSpaces[i]

                // Does it fit?
                if (space.width >= size && space.height >= size) {
                    // Score = How tightly it fits (smaller is better)
                    const score = Math.min(space.width - size, space.height - size)

                    if (score < bestScore) {
                        bestScore = score
                        bestSpaceIndex = i
                    }
                }
            }

            // If we found a valid spot...
            if (bestSpaceIndex !== -1) {
                const space = freeSpaces[bestSpaceIndex]

                // 4. Place the building at top-left of the space
                const placementRect = new Rectangle(space.x, space.y, size, size)

                placements.push({
                    building,
                    bounds: placementRect,
                    facing: 'south' // Default facing
                })

                // 5. Guillotine Cut: Split the remaining L-shape
                const remainingW = space.width - size
                const remainingH = space.height - size

                let rightRect: Rectangle
                let bottomRect: Rectangle

                // Choose split that leaves larger usable rectangle
                if (remainingW > remainingH) {
                    // Vertical cut (right side is bigger)
                    rightRect = new Rectangle(
                        space.x + size,
                        space.y,
                        remainingW,
                        space.height
                    )
                    bottomRect = new Rectangle(
                        space.x,
                        space.y + size,
                        size,
                        remainingH
                    )
                } else {
                    // Horizontal cut (bottom side is bigger)
                    rightRect = new Rectangle(
                        space.x + size,
                        space.y,
                        remainingW,
                        size
                    )
                    bottomRect = new Rectangle(
                        space.x,
                        space.y + size,
                        space.width,
                        remainingH
                    )
                }

                // 6. Add alley padding to create gaps
                if (rightRect.width > 0) {
                    rightRect.x += this.alleyWidth
                    rightRect.width -= this.alleyWidth
                }
                if (bottomRect.height > 0) {
                    bottomRect.y += this.alleyWidth
                    bottomRect.height -= this.alleyWidth
                }

                // 7. Update free space list
                freeSpaces.splice(bestSpaceIndex, 1)

                // Only keep fragments big enough to hold future buildings
                const minSize = 40
                if (rightRect.width > minSize && rightRect.height > minSize) {
                    freeSpaces.push(rightRect)
                }
                if (bottomRect.width > minSize && bottomRect.height > minSize) {
                    freeSpaces.push(bottomRect)
                }
            }
        }

        return placements
    }

    private getDistrictColor(_district: District, index: number): number {
        const colors = [
            0x3b82f6, 0x10b981, 0xf59e0b, 0xef4444,
            0x8b5cf6, 0xec4899, 0x14b8a6, 0xf97316,
        ]
        return colors[index % colors.length]
    }
}