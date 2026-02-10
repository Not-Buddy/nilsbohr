// engine/CityGenerator/CollisionResolver.ts
// Collision detection and resolution for districts and buildings

import type { Building } from '../../types/SeedTypes'
import type { DistrictPosition, BuildingPosition, CityBounds } from './types'

export class CollisionResolver {
    /**
     * Resolve collisions between districts using force-based pushing.
     */
    resolveDistrictCollisions(
        positions: Map<string, DistrictPosition>
    ): { positions: Map<string, DistrictPosition>; bounds: CityBounds } {
        const posArray = Array.from(positions.entries())

        for (let iter = 0; iter < 10; iter++) {
            let hasCollision = false

            for (let i = 0; i < posArray.length; i++) {
                for (let j = i + 1; j < posArray.length; j++) {
                    const [idA, posA] = posArray[i]
                    const [idB, posB] = posArray[j]

                    const dx = posB.x - posA.x
                    const dy = posB.y - posA.y
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1

                    const minDist = (posA.width + posB.width) / 2 + 50

                    if (distance < minDist) {
                        hasCollision = true
                        const force = (minDist - distance) / 2
                        const nx = dx / distance
                        const ny = dy / distance

                        posA.x -= nx * force
                        posA.y -= ny * force
                        posB.x += nx * force
                        posB.y += ny * force

                        positions.set(idA, posA)
                        positions.set(idB, posB)
                    }
                }
            }

            if (!hasCollision) break
        }

        // Recalculate bounds after collision resolution
        const bounds = this.calculateBoundsFromPositions(positions)
        return { positions, bounds }
    }

    /**
     * Resolve collisions between buildings within a district.
     */
    resolveBuildingCollisions(
        buildings: Building[],
        buildingPositions: Map<string, BuildingPosition>,
        districtPos: DistrictPosition
    ): void {
        const maxIterations = 15
        const minSeparation = 25

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            let hasCollision = false

            for (let i = 0; i < buildings.length; i++) {
                const buildingA = buildings[i]
                const posA = buildingPositions.get(buildingA.spec.id)
                if (!posA) continue

                for (let j = i + 1; j < buildings.length; j++) {
                    const buildingB = buildings[j]
                    const posB = buildingPositions.get(buildingB.spec.id)
                    if (!posB) continue

                    const dx = posB.x - posA.x
                    const dy = posB.y - posA.y
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1

                    const requiredDistance = (posA.width + posB.width) / 2 + minSeparation

                    if (distance < requiredDistance) {
                        hasCollision = true

                        const overlap = (requiredDistance - distance) / 2
                        const nx = dx / distance
                        const ny = dy / distance

                        posA.x -= nx * overlap
                        posA.y -= ny * overlap
                        posB.x += nx * overlap
                        posB.y += ny * overlap

                        // Keep buildings within district bounds
                        this.constrainToDistrict(posA, districtPos)
                        this.constrainToDistrict(posB, districtPos)

                        buildingPositions.set(buildingA.spec.id, posA)
                        buildingPositions.set(buildingB.spec.id, posB)
                    }
                }
            }

            if (!hasCollision) break
        }
    }

    /**
     * Check if two buildings overlap.
     */
    buildingsOverlap(a: BuildingPosition, b: BuildingPosition, padding: number = 20): boolean {
        return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding &&
            Math.abs(a.y - b.y) < (a.height + b.height) / 2 + padding
    }

    private constrainToDistrict(pos: BuildingPosition, districtPos: DistrictPosition): void {
        pos.x = Math.max(
            districtPos.x - districtPos.width / 2 + pos.width / 2,
            Math.min(districtPos.x + districtPos.width / 2 - pos.width / 2, pos.x)
        )
        pos.y = Math.max(
            districtPos.y - districtPos.height / 2 + pos.height / 2,
            Math.min(districtPos.y + districtPos.height / 2 - pos.height / 2, pos.y)
        )
    }

    private calculateBoundsFromPositions(positions: Map<string, DistrictPosition>): CityBounds {
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity

        for (const pos of positions.values()) {
            minX = Math.min(minX, pos.x - pos.width / 2)
            maxX = Math.max(maxX, pos.x + pos.width / 2)
            minY = Math.min(minY, pos.y - pos.height / 2)
            maxY = Math.max(maxY, pos.y + pos.height / 2)
        }

        const padding = 300
        return {
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        }
    }
}
