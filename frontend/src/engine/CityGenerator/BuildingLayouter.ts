// engine/CityGenerator/BuildingLayouter.ts
// Building layout strategies within districts

import type { Building } from '../../types/SeedTypes'
import type { SeededRandom } from '../SeededRandom'
import type { DistrictPosition, BuildingPosition } from './types'

export interface BuildingLayouterConfig {
    calculateBuildingSize: (building: Building) => { width: number; height: number; floors: number }
}

export class BuildingLayouter {
    private calculateBuildingSize: (building: Building) => { width: number; height: number; floors: number }

    constructor(config: BuildingLayouterConfig) {
        this.calculateBuildingSize = config.calculateBuildingSize
    }

    /**
     * Grid layout for buildings within a district.
     */
    layoutGrid(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): Map<string, BuildingPosition> {
        const positions = new Map<string, BuildingPosition>()

        const cols = Math.ceil(Math.sqrt(buildings.length))
        const baseSpacing = 130  // Increased from 100
        const densityFactor = Math.max(1.0, Math.min(2.0, buildings.length / 50))
        const spacing = baseSpacing * densityFactor
        const startX = districtPos.x - (cols * spacing) / 2
        const startY = districtPos.y - (Math.ceil(buildings.length / cols) * spacing) / 2

        buildings.forEach((building, index) => {
            const col = index % cols
            const row = Math.floor(index / cols)
            const size = this.calculateBuildingSize(building)

            positions.set(building.spec.id, {
                x: startX + col * spacing + rng.range(-10, 10),
                y: startY + row * spacing + rng.range(-10, 10),
                width: size.width,
                height: size.height,
                floors: size.floors,
            })
        })

        return positions
    }

    /**
     * Tightly packed layout (Tetris-like bin packing).
     */
    layoutPacked(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): Map<string, BuildingPosition> {
        const positions = new Map<string, BuildingPosition>()

        // Sort by size (larger first for better packing)
        const sorted = [...buildings].sort((a, b) => b.spec.loc - a.spec.loc)

        const rows: { y: number; height: number; items: { x: number; width: number }[] }[] = []
        const basePadding = 25  // Increased from 15
        const densityFactor = Math.max(1.0, Math.min(2.0, buildings.length / 50))
        const padding = basePadding * densityFactor
        const startX = districtPos.x - districtPos.width / 2

        sorted.forEach(building => {
            const size = this.calculateBuildingSize(building)
            let placed = false

            // Try to fit in existing row
            for (const row of rows) {
                const lastItem = row.items[row.items.length - 1]
                const nextX = lastItem ? lastItem.x + lastItem.width + padding : startX

                if (nextX + size.width <= districtPos.x + districtPos.width / 2) {
                    positions.set(building.spec.id, {
                        x: nextX + rng.range(-5, 5),
                        y: row.y + rng.range(-5, 5),
                        width: size.width,
                        height: size.height,
                        floors: size.floors,
                    })
                    row.items.push({ x: nextX, width: size.width })
                    placed = true
                    break
                }
            }

            // Create new row
            if (!placed) {
                const lastRow = rows[rows.length - 1]
                const newY = lastRow
                    ? lastRow.y + lastRow.height + padding
                    : districtPos.y - districtPos.height / 2

                positions.set(building.spec.id, {
                    x: startX + rng.range(-5, 5),
                    y: newY + rng.range(-5, 5),
                    width: size.width,
                    height: size.height,
                    floors: size.floors,
                })
                rows.push({ y: newY, height: size.height, items: [{ x: startX, width: size.width }] })
            }
        })

        return positions
    }

    /**
     * Scattered organic layout.
     */
    layoutScattered(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): Map<string, BuildingPosition> {
        const positions = new Map<string, BuildingPosition>()
        const placed: BuildingPosition[] = []

        buildings.forEach(building => {
            const size = this.calculateBuildingSize(building)
            let attempts = 0
            let position: BuildingPosition | null = null

            const maxAttempts = buildings.length > 50 ? 100 : 50

            while (attempts < maxAttempts && !position) {
                const candidate: BuildingPosition = {
                    x: districtPos.x + rng.gaussian(0, districtPos.width / 4),
                    y: districtPos.y + rng.gaussian(0, districtPos.height / 4),
                    width: size.width,
                    height: size.height,
                    floors: size.floors,
                }

                // Check collisions
                const collides = placed.some(p => this.buildingsOverlap(candidate, p))
                if (!collides) {
                    position = candidate
                }
                attempts++
            }

            // Fallback with reduced size
            if (!position) {
                position = {
                    x: districtPos.x + rng.range(-districtPos.width / 2, districtPos.width / 2),
                    y: districtPos.y + rng.range(-districtPos.height / 2, districtPos.height / 2),
                    width: size.width * 0.8,
                    height: size.height * 0.8,
                    floors: size.floors,
                }
            }

            positions.set(building.spec.id, position)
            placed.push(position)
        })

        return positions
    }

    /**
     * Street-based layout (buildings along roads).
     */
    layoutStreet(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): Map<string, BuildingPosition> {
        const positions = new Map<string, BuildingPosition>()

        const streetWidth = 80  // Increased from 60
        const baseSpacing = 35  // Increased from 20
        const densityFactor = Math.max(1.0, Math.min(2.0, buildings.length / 50))
        const buildingSpacing = baseSpacing * densityFactor

        let x = districtPos.x - districtPos.width / 2 + 50

        buildings.forEach((building, index) => {
            const size = this.calculateBuildingSize(building)
            const side = index % 2 === 0 ? -1 : 1
            const yOffset = (streetWidth / 2 + size.height / 2) * side

            positions.set(building.spec.id, {
                x: x + rng.range(-5, 5),
                y: districtPos.y + yOffset + rng.range(-10, 10),
                width: size.width,
                height: size.height,
                floors: size.floors,
            })

            if (index % 2 === 1) {
                x += Math.max(size.width, 60) + buildingSpacing
            }
        })

        return positions
    }

    private buildingsOverlap(a: BuildingPosition, b: BuildingPosition): boolean {
        const padding = 20
        return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding &&
            Math.abs(a.y - b.y) < (a.height + b.height) / 2 + padding
    }
}
