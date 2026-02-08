// engine/WorldGenerator.ts
// Deterministic world layout generator

import type { City, ProjectMeta } from '../types/SeedTypes'
import { SeededRandom, createWorldRng } from './SeededRandom'

export interface CityPosition {
    x: number
    y: number
    radius: number
}

export interface WorldBounds {
    width: number
    height: number
    centerX: number
    centerY: number
}

/**
 * Generates deterministic world layouts from project seed data.
 * The same seed always produces the same city positions.
 */
export class WorldGenerator {
    private rng: SeededRandom
    private cityPositions: Map<string, CityPosition> = new Map()
    private worldBounds: WorldBounds = { width: 4000, height: 2000, centerX: 2000, centerY: 1000 }

    constructor(project: ProjectMeta) {
        this.rng = createWorldRng(project.name, project.generated_at)
    }

    /**
     * Generate positions for all cities using an organic spiral layout.
     * Cities are placed in an expanding spiral with random perturbation.
     */
    generateCityLayout(cities: City[]): void {
        this.cityPositions.clear()

        const numCities = cities.length
        if (numCities === 0) return

        // Calculate world size based on city count
        const baseRadius = 400
        const spiralExpansion = 300
        const maxRadius = baseRadius + numCities * spiralExpansion

        this.worldBounds = {
            width: maxRadius * 2.5,
            height: maxRadius * 2,
            centerX: maxRadius * 1.25,
            centerY: maxRadius,
        }

        // Sort cities by LOC for consistent ordering
        const sortedCities = [...cities].sort((a, b) => b.spec.stats.loc - a.spec.stats.loc)

        // Golden angle for spiral distribution
        const goldenAngle = Math.PI * (3 - Math.sqrt(5))

        sortedCities.forEach((city, index) => {
            const cityRng = this.rng.fork(city.spec.id)

            // Spiral placement with golden angle
            const angle = index * goldenAngle + cityRng.range(-0.2, 0.2)

            // Distance from center increases with index, perturbed by city size
            const locFactor = Math.min(city.spec.stats.loc / 5000, 1) // Normalize LOC
            const baseDistance = baseRadius + index * spiralExpansion * 0.7
            const distance = baseDistance + cityRng.range(-100, 100) + locFactor * 200

            // Calculate city visual radius based on stats
            const cityRadius = this.calculateCityRadius(city)

            const position: CityPosition = {
                x: this.worldBounds.centerX + Math.cos(angle) * distance,
                y: this.worldBounds.centerY + Math.sin(angle) * distance,
                radius: cityRadius,
            }

            this.cityPositions.set(city.spec.id, position)
        })

        // Collision resolution pass
        this.resolveCollisions()
    }

    /**
     * Calculate the visual radius of a city based on its stats.
     */
    private calculateCityRadius(city: City): number {
        const locRadius = 40 + city.spec.stats.loc * 0.02
        const buildingRadius = 40 + city.spec.stats.building_count * 3
        return Math.min(Math.max(locRadius, buildingRadius), 150)
    }

    /**
     * Push overlapping cities apart.
     */
    private resolveCollisions(): void {
        const positions = Array.from(this.cityPositions.entries())
        const minDistance = 250 // Minimum distance between city centers

        for (let iteration = 0; iteration < 10; iteration++) {
            let hasCollision = false

            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const [idA, posA] = positions[i]
                    const [idB, posB] = positions[j]

                    const dx = posB.x - posA.x
                    const dy = posB.y - posA.y
                    const distance = Math.sqrt(dx * dx + dy * dy)
                    const requiredDistance = posA.radius + posB.radius + minDistance

                    if (distance < requiredDistance && distance > 0) {
                        hasCollision = true
                        const overlap = (requiredDistance - distance) / 2
                        const nx = dx / distance
                        const ny = dy / distance

                        posA.x -= nx * overlap
                        posA.y -= ny * overlap
                        posB.x += nx * overlap
                        posB.y += ny * overlap

                        this.cityPositions.set(idA, posA)
                        this.cityPositions.set(idB, posB)
                    }
                }
            }

            if (!hasCollision) break
        }

        // Recalculate world bounds after collision resolution
        this.recalculateWorldBounds()
    }

    /**
     * Recalculate world bounds to encompass all cities.
     */
    private recalculateWorldBounds(): void {
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity

        for (const pos of this.cityPositions.values()) {
            minX = Math.min(minX, pos.x - pos.radius)
            maxX = Math.max(maxX, pos.x + pos.radius)
            minY = Math.min(minY, pos.y - pos.radius)
            maxY = Math.max(maxY, pos.y + pos.radius)
        }

        const padding = 500
        this.worldBounds = {
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        }
    }

    /**
     * Get the position of a specific city.
     */
    getCityPosition(cityId: string): CityPosition | undefined {
        return this.cityPositions.get(cityId)
    }

    /**
     * Get all city positions.
     */
    getAllCityPositions(): Map<string, CityPosition> {
        return new Map(this.cityPositions)
    }

    /**
     * Get the calculated world bounds.
     */
    getWorldBounds(): WorldBounds {
        return { ...this.worldBounds }
    }

    /**
     * Get player spawn position (center of the world).
     */
    getSpawnPosition(): { x: number, y: number } {
        return {
            x: this.worldBounds.centerX,
            y: this.worldBounds.centerY,
        }
    }

    /**
     * Get the RNG instance for additional procedural generation.
     */
    getRng(): SeededRandom {
        return this.rng
    }
}
