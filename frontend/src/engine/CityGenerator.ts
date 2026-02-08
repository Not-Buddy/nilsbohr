// engine/CityGenerator.ts
// Deterministic city layout generator for districts and buildings

import type { City, District, Building, Room } from '../types/SeedTypes'
import { SeededRandom } from './SeededRandom'

// ============================================================================
// POSITION INTERFACES
// ============================================================================

export interface DistrictPosition {
    x: number
    y: number
    width: number
    height: number
    rotation: number
}

export interface BuildingPosition {
    x: number
    y: number
    width: number
    height: number
    floors: number
}

export interface RoomPosition {
    x: number
    y: number
    width: number
    height: number
    floor: number
}

export interface CityBounds {
    width: number
    height: number
    centerX: number
    centerY: number
}

// ============================================================================
// LAYOUT STRATEGIES
// ============================================================================

export type DistrictLayoutStrategy = 'radial' | 'grid' | 'organic' | 'linear'
export type BuildingLayoutStrategy = 'grid' | 'packed' | 'scattered' | 'street'

// ============================================================================
// CITY GENERATOR
// ============================================================================

/**
 * Generates deterministic layouts for cities, including district and building placement.
 * The same city data + seed always produces identical layouts.
 */
export class CityGenerator {
    private rng: SeededRandom
    private city: City
    private districtPositions: Map<string, DistrictPosition> = new Map()
    private buildingPositions: Map<string, BuildingPosition> = new Map()
    // Room positions reserved for future building interior layouts
    private cityBounds: CityBounds = { width: 3000, height: 2000, centerX: 1500, centerY: 1000 }

    constructor(city: City, worldRng: SeededRandom) {
        this.city = city
        // Create a city-specific RNG derived from the world RNG
        this.rng = worldRng.fork(`city:${city.spec.id}`)
    }

    // ==========================================================================
    // MAIN GENERATION METHODS
    // ==========================================================================

    /**
     * Generate the complete city layout including all districts and buildings.
     */
    generate(strategy: DistrictLayoutStrategy = 'radial'): void {
        const districts = this.getDistricts()

        // Calculate city bounds based on content
        this.calculateCityBounds(districts)

        // Generate district layout
        switch (strategy) {
            case 'radial':
                this.layoutDistrictsRadial(districts)
                break
            case 'grid':
                this.layoutDistrictsGrid(districts)
                break
            case 'organic':
                this.layoutDistrictsOrganic(districts)
                break
            case 'linear':
                this.layoutDistrictsLinear(districts)
                break
        }

        // Generate building layouts within each district
        districts.forEach(district => {
            this.layoutBuildingsInDistrict(district)
        })

        // Resolve any overlaps
        this.resolveDistrictCollisions()
    }

    // ==========================================================================
    // DISTRICT LAYOUTS
    // ==========================================================================

    /**
     * Radial layout: Districts arranged in concentric rings from center.
     * Larger districts (more buildings) are placed closer to center.
     */
    private layoutDistrictsRadial(districts: District[]): void {
        if (districts.length === 0) return

        // Sort by building count (larger districts closer to center)
        const sorted = [...districts].sort((a, b) =>
            this.getBuildings(b).length - this.getBuildings(a).length
        )

        const goldenAngle = Math.PI * (3 - Math.sqrt(5))
        const baseRadius = 200
        const ringSpacing = 300

        sorted.forEach((district, index) => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)

            // Calculate district size based on content
            const size = this.calculateDistrictSize(district)

            // Fermat spiral placement
            const angle = index * goldenAngle + districtRng.range(-0.15, 0.15)
            const radius = baseRadius + Math.sqrt(index) * ringSpacing + districtRng.range(-50, 50)

            const position: DistrictPosition = {
                x: this.cityBounds.centerX + Math.cos(angle) * radius,
                y: this.cityBounds.centerY + Math.sin(angle) * radius,
                width: size.width,
                height: size.height,
                rotation: districtRng.range(-0.1, 0.1), // Slight random rotation
            }

            this.districtPositions.set(district.spec.id, position)
        })
    }

    /**
     * Grid layout: Districts arranged in a regular grid pattern.
     */
    private layoutDistrictsGrid(districts: District[]): void {
        if (districts.length === 0) return

        const cols = Math.ceil(Math.sqrt(districts.length))
        const cellWidth = this.cityBounds.width / (cols + 1)
        const cellHeight = this.cityBounds.height / (Math.ceil(districts.length / cols) + 1)

        districts.forEach((district, index) => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            const size = this.calculateDistrictSize(district)

            const col = index % cols
            const row = Math.floor(index / cols)

            const position: DistrictPosition = {
                x: (col + 1) * cellWidth + districtRng.range(-20, 20),
                y: (row + 1) * cellHeight + districtRng.range(-20, 20),
                width: size.width,
                height: size.height,
                rotation: 0,
            }

            this.districtPositions.set(district.spec.id, position)
        })
    }

    /**
     * Organic layout: Natural clustering with noise-based placement.
     */
    private layoutDistrictsOrganic(districts: District[]): void {
        if (districts.length === 0) return

        // Use a force-directed approach
        const positions: Map<string, { x: number; y: number }> = new Map()

        // Initial random placement
        districts.forEach(district => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            positions.set(district.spec.id, {
                x: this.cityBounds.centerX + districtRng.gaussian(0, this.cityBounds.width / 4),
                y: this.cityBounds.centerY + districtRng.gaussian(0, this.cityBounds.height / 4),
            })
        })

        // Force-directed iterations
        for (let iter = 0; iter < 50; iter++) {
            districts.forEach((districtA, i) => {
                districts.forEach((districtB, j) => {
                    if (i >= j) return

                    const posA = positions.get(districtA.spec.id)!
                    const posB = positions.get(districtB.spec.id)!

                    const dx = posB.x - posA.x
                    const dy = posB.y - posA.y
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1

                    const sizeA = this.calculateDistrictSize(districtA)
                    const sizeB = this.calculateDistrictSize(districtB)
                    const minDist = (sizeA.width + sizeB.width) / 2 + 100

                    if (distance < minDist) {
                        const force = (minDist - distance) / distance * 0.3
                        posA.x -= dx * force
                        posA.y -= dy * force
                        posB.x += dx * force
                        posB.y += dy * force
                    }
                })
            })
        }

        // Finalize positions
        districts.forEach(district => {
            const pos = positions.get(district.spec.id)!
            const size = this.calculateDistrictSize(district)
            const districtRng = this.rng.fork(`district:${district.spec.id}`)

            this.districtPositions.set(district.spec.id, {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                rotation: districtRng.range(-0.15, 0.15),
            })
        })
    }

    /**
     * Linear layout: Districts arranged along a main road/axis.
     */
    private layoutDistrictsLinear(districts: District[]): void {
        if (districts.length === 0) return

        const spacing = this.cityBounds.width / (districts.length + 1)
        const centerY = this.cityBounds.centerY

        districts.forEach((district, index) => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            const size = this.calculateDistrictSize(district)

            // Alternate above/below the main axis
            const offset = (index % 2 === 0 ? -1 : 1) * (size.height / 2 + 50)

            const position: DistrictPosition = {
                x: (index + 1) * spacing,
                y: centerY + offset + districtRng.range(-30, 30),
                width: size.width,
                height: size.height,
                rotation: 0,
            }

            this.districtPositions.set(district.spec.id, position)
        })
    }

    // ==========================================================================
    // BUILDING LAYOUTS
    // ==========================================================================

    /**
     * Layout buildings within a district.
     */
    private layoutBuildingsInDistrict(
        district: District,
        strategy: BuildingLayoutStrategy = 'grid'
    ): void {
        const buildings = this.getBuildings(district)
        const districtPos = this.districtPositions.get(district.spec.id)
        if (!districtPos || buildings.length === 0) return

        const districtRng = this.rng.fork(`buildings:${district.spec.id}`)

        switch (strategy) {
            case 'grid':
                this.layoutBuildingsGrid(buildings, districtPos, districtRng)
                break
            case 'packed':
                this.layoutBuildingsPacked(buildings, districtPos, districtRng)
                break
            case 'scattered':
                this.layoutBuildingsScattered(buildings, districtPos, districtRng)
                break
            case 'street':
                this.layoutBuildingsStreet(buildings, districtPos, districtRng)
                break
        }
    }

    /**
     * Grid layout for buildings within a district.
     */
    private layoutBuildingsGrid(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): void {
        const cols = Math.ceil(Math.sqrt(buildings.length))
        const spacing = 100
        const startX = districtPos.x - (cols * spacing) / 2
        const startY = districtPos.y - (Math.ceil(buildings.length / cols) * spacing) / 2

        buildings.forEach((building, index) => {
            const col = index % cols
            const row = Math.floor(index / cols)
            const size = this.calculateBuildingSize(building)

            const position: BuildingPosition = {
                x: startX + col * spacing + rng.range(-10, 10),
                y: startY + row * spacing + rng.range(-10, 10),
                width: size.width,
                height: size.height,
                floors: size.floors,
            }

            this.buildingPositions.set(building.spec.id, position)
        })
    }

    /**
     * Tightly packed layout (Tetris-like bin packing).
     */
    private layoutBuildingsPacked(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): void {
        // Sort by size (larger first for better packing)
        const sorted = [...buildings].sort((a, b) => b.spec.loc - a.spec.loc)

        const rows: { y: number; height: number; items: { x: number; width: number }[] }[] = []
        const padding = 15
        const startX = districtPos.x - districtPos.width / 2

        sorted.forEach(building => {
            const size = this.calculateBuildingSize(building)
            let placed = false

            // Try to fit in existing row
            for (const row of rows) {
                const lastItem = row.items[row.items.length - 1]
                const nextX = lastItem ? lastItem.x + lastItem.width + padding : startX

                if (nextX + size.width <= districtPos.x + districtPos.width / 2) {
                    this.buildingPositions.set(building.spec.id, {
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

                this.buildingPositions.set(building.spec.id, {
                    x: startX + rng.range(-5, 5),
                    y: newY + rng.range(-5, 5),
                    width: size.width,
                    height: size.height,
                    floors: size.floors,
                })
                rows.push({ y: newY, height: size.height, items: [{ x: startX, width: size.width }] })
            }
        })
    }

    /**
     * Scattered organic layout.
     */
    private layoutBuildingsScattered(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): void {
        const placed: BuildingPosition[] = []

        buildings.forEach(building => {
            const size = this.calculateBuildingSize(building)
            let attempts = 0
            let position: BuildingPosition | null = null

            while (attempts < 50 && !position) {
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

            // Fallback to random placement if no valid position found
            if (!position) {
                position = {
                    x: districtPos.x + rng.range(-districtPos.width / 2, districtPos.width / 2),
                    y: districtPos.y + rng.range(-districtPos.height / 2, districtPos.height / 2),
                    width: size.width,
                    height: size.height,
                    floors: size.floors,
                }
            }

            this.buildingPositions.set(building.spec.id, position)
            placed.push(position)
        })
    }

    /**
     * Street-based layout (buildings along roads).
     */
    private layoutBuildingsStreet(
        buildings: Building[],
        districtPos: DistrictPosition,
        rng: SeededRandom
    ): void {
        const streetWidth = 60
        const buildingSpacing = 20

        // Main street runs horizontally through district center
        let x = districtPos.x - districtPos.width / 2 + 50

        buildings.forEach((building, index) => {
            const size = this.calculateBuildingSize(building)
            // Alternate sides of the street
            const side = index % 2 === 0 ? -1 : 1
            const yOffset = (streetWidth / 2 + size.height / 2) * side

            const position: BuildingPosition = {
                x: x + rng.range(-5, 5),
                y: districtPos.y + yOffset + rng.range(-10, 10),
                width: size.width,
                height: size.height,
                floors: size.floors,
            }

            this.buildingPositions.set(building.spec.id, position)

            // Move x forward every 2 buildings (one on each side)
            if (index % 2 === 1) {
                x += Math.max(size.width, 60) + buildingSpacing
            }
        })
    }

    // ==========================================================================
    // COLLISION RESOLUTION
    // ==========================================================================

    private resolveDistrictCollisions(): void {
        const positions = Array.from(this.districtPositions.entries())

        for (let iter = 0; iter < 10; iter++) {
            let hasCollision = false

            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const [idA, posA] = positions[i]
                    const [idB, posB] = positions[j]

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

                        this.districtPositions.set(idA, posA)
                        this.districtPositions.set(idB, posB)
                    }
                }
            }

            if (!hasCollision) break
        }

        this.recalculateCityBounds()
    }

    private buildingsOverlap(a: BuildingPosition, b: BuildingPosition): boolean {
        const padding = 20
        return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + padding &&
            Math.abs(a.y - b.y) < (a.height + b.height) / 2 + padding
    }

    // ==========================================================================
    // SIZE CALCULATIONS
    // ==========================================================================

    private calculateDistrictSize(district: District): { width: number; height: number } {
        const buildings = this.getBuildings(district)
        const baseSize = 200
        const perBuilding = 60
        const size = baseSize + Math.sqrt(buildings.length) * perBuilding

        return {
            width: size + this.rng.fork(district.spec.id).range(-30, 30),
            height: size * 0.8 + this.rng.fork(district.spec.id).range(-20, 20),
        }
    }

    private calculateBuildingSize(building: Building): { width: number; height: number; floors: number } {
        const rooms = this.getRooms(building)
        const locFactor = Math.min(building.spec.loc / 500, 1)

        const baseWidth = 40
        const baseHeight = 40
        const floors = Math.max(1, Math.min(5, Math.floor(rooms.length / 3) + 1))

        return {
            width: baseWidth + locFactor * 30 + rooms.length * 5,
            height: baseHeight + locFactor * 20,
            floors,
        }
    }

    private calculateCityBounds(districts: District[]): void {
        const totalBuildings = districts.reduce((sum, d) => sum + this.getBuildings(d).length, 0)
        const size = 2000 + Math.sqrt(totalBuildings) * 200

        this.cityBounds = {
            width: size,
            height: size * 0.75,
            centerX: size / 2,
            centerY: size * 0.75 / 2,
        }
    }

    private recalculateCityBounds(): void {
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity

        for (const pos of this.districtPositions.values()) {
            minX = Math.min(minX, pos.x - pos.width / 2)
            maxX = Math.max(maxX, pos.x + pos.width / 2)
            minY = Math.min(minY, pos.y - pos.height / 2)
            maxY = Math.max(maxY, pos.y + pos.height / 2)
        }

        const padding = 300
        this.cityBounds = {
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
        }
    }

    // ==========================================================================
    // DATA ACCESSORS (support both old and new formats)
    // ==========================================================================

    private getDistricts(): District[] {
        if (this.city.districts && this.city.districts.length > 0) {
            return this.city.districts
        }
        const spec = this.city.spec as any
        if (spec.children && Array.isArray(spec.children)) {
            return spec.children.filter((e: any) => e.kind === 'District')
        }
        return []
    }

    private getBuildings(district: District): Building[] {
        if (district.buildings && district.buildings.length > 0) {
            return district.buildings
        }
        const spec = district.spec as any
        if (spec.children && Array.isArray(spec.children)) {
            return spec.children.filter((e: any) => e.kind === 'Building')
        }
        return []
    }

    private getRooms(building: Building): Room[] {
        if (building.rooms && building.rooms.length > 0) {
            return building.rooms
        }
        const spec = building.spec as any
        if (spec.children && Array.isArray(spec.children)) {
            return spec.children.filter((e: any) => e.kind === 'Room')
        }
        return []
    }

    // ==========================================================================
    // PUBLIC GETTERS
    // ==========================================================================

    getDistrictPosition(districtId: string): DistrictPosition | undefined {
        return this.districtPositions.get(districtId)
    }

    getBuildingPosition(buildingId: string): BuildingPosition | undefined {
        return this.buildingPositions.get(buildingId)
    }

    getAllDistrictPositions(): Map<string, DistrictPosition> {
        return new Map(this.districtPositions)
    }

    getAllBuildingPositions(): Map<string, BuildingPosition> {
        return new Map(this.buildingPositions)
    }

    getCityBounds(): CityBounds {
        return { ...this.cityBounds }
    }

    getSpawnPosition(): { x: number; y: number } {
        return {
            x: this.cityBounds.centerX,
            y: this.cityBounds.centerY,
        }
    }

    getRng(): SeededRandom {
        return this.rng
    }
}
