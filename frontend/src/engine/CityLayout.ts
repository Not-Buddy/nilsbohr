// engine/CityLayout.ts
// Simplified city layout system for district and building placement

import type { District, Building } from '../types/SeedTypes'
import { SeededRandom } from './SeededRandom'

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
    x: number
    y: number
    width: number
    height: number
}

/**
 * Simple layout system using recursive binary space partitioning (BSP)
 * for organic district placement.
 */
export class CityLayout {
    private rng: SeededRandom

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
            const padding = 20
            const innerBounds = {
                x: split.x + padding,
                y: split.y + padding,
                width: split.width - padding * 2,
                height: split.height - padding * 2,
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
     */
    private bspSplit(
        rect: { x: number; y: number; width: number; height: number },
        numSplits: number,
        depth: number
    ): { x: number; y: number; width: number; height: number }[] {
        if (numSplits <= 1 || depth > 4) {
            return [rect]
        }

        const horizontal = this.rng.next() > 0.5
        const splitRatio = this.rng.range(0.4, 0.6)

        let rect1, rect2

        if (horizontal) {
            const splitY = rect.y + rect.height * splitRatio
            rect1 = { x: rect.x, y: rect.y, width: rect.width, height: splitY - rect.y }
            rect2 = { x: rect.x, y: splitY, width: rect.width, height: rect.y + rect.height - splitY }
        } else {
            const splitX = rect.x + rect.width * splitRatio
            rect1 = { x: rect.x, y: rect.y, width: splitX - rect.x, height: rect.height }
            rect2 = { x: splitX, y: rect.y, width: rect.x + rect.width - splitX, height: rect.height }
        }

        const half = Math.ceil(numSplits / 2)
        return [
            ...this.bspSplit(rect1, half, depth + 1),
            ...this.bspSplit(rect2, numSplits - half, depth + 1),
        ]
    }

    /**
     * Pack buildings into a district using simple grid layout.
     */
    packBuildings(
        buildings: Building[],
        districtBounds: { x: number; y: number; width: number; height: number }
    ): BuildingPlacement[] {
        const placements: BuildingPlacement[] = []

        // Simple grid packing
        const cols = Math.ceil(Math.sqrt(buildings.length))
        const cellWidth = 80
        const cellHeight = 80
        const padding = 10

        const startX = districtBounds.x + 30
        const startY = districtBounds.y + 50 // Leave space for label

        buildings.forEach((building, i) => {
            const col = i % cols
            const row = Math.floor(i / cols)

            const x = startX + col * (cellWidth + padding)
            const y = startY + row * (cellHeight + padding)

            // Check bounds
            if (x + cellWidth <= districtBounds.x + districtBounds.width &&
                y + cellHeight <= districtBounds.y + districtBounds.height) {
                placements.push({
                    building,
                    x,
                    y,
                    width: cellWidth,
                    height: cellHeight,
                })
            }
        })

        return placements
    }

    /**
     * Get a color for a district based on its properties.
     */
    private getDistrictColor(_district: District, index: number): number {
        const colors = [
            0x3b82f6, // blue
            0x10b981, // green
            0xf59e0b, // amber
            0xef4444, // red
            0x8b5cf6, // purple
            0xec4899, // pink
            0x14b8a6, // teal
            0xf97316, // orange
        ]

        return colors[index % colors.length]
    }
}
