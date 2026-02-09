// engine/CityGenerator/CityGenerator.ts
// Main orchestrator for city generation

import type { City, District, Building, Room } from '../../types/SeedTypes'
import { SeededRandom } from '../SeededRandom'
import { DistrictLayouter } from './DistrictLayouter'
import { BuildingLayouter } from './BuildingLayouter'
import { CollisionResolver } from './CollisionResolver'
import type {
    DistrictPosition,
    BuildingPosition,
    CityBounds,
    DistrictLayoutStrategy,
    BuildingLayoutStrategy,
} from './types'

/**
 * Generates deterministic layouts for cities, including district and building placement.
 * The same city data + seed always produces identical layouts.
 */
export class CityGenerator {
    private rng: SeededRandom
    private city: City
    private districtPositions: Map<string, DistrictPosition> = new Map()
    private buildingPositions: Map<string, BuildingPosition> = new Map()
    private cityBounds: CityBounds = { width: 3000, height: 2000, centerX: 1500, centerY: 1000 }

    private districtLayouter: DistrictLayouter
    private buildingLayouter: BuildingLayouter
    private collisionResolver: CollisionResolver

    constructor(city: City, worldRng: SeededRandom) {
        this.city = city
        this.rng = worldRng.fork(`city:${city.spec.id}`)

        // Initialize sub-systems
        this.districtLayouter = new DistrictLayouter({
            rng: this.rng,
            cityBounds: this.cityBounds,
            getBuildings: (d) => this.getBuildings(d),
            calculateDistrictSize: (d) => this.calculateDistrictSize(d),
        })

        this.buildingLayouter = new BuildingLayouter({
            calculateBuildingSize: (b) => this.calculateBuildingSize(b),
        })

        this.collisionResolver = new CollisionResolver()
    }

    // ==========================================================================
    // MAIN GENERATION
    // ==========================================================================

    generate(strategy: DistrictLayoutStrategy = 'radial'): void {
        const districts = this.getDistricts()

        // Calculate city bounds based on content
        this.calculateCityBounds(districts)

        // Update layouter with new bounds
        this.districtLayouter = new DistrictLayouter({
            rng: this.rng,
            cityBounds: this.cityBounds,
            getBuildings: (d) => this.getBuildings(d),
            calculateDistrictSize: (d) => this.calculateDistrictSize(d),
        })

        // Generate district layout
        switch (strategy) {
            case 'radial':
                this.districtPositions = this.districtLayouter.layoutRadial(districts)
                break
            case 'grid':
                this.districtPositions = this.districtLayouter.layoutGrid(districts)
                break
            case 'organic':
                this.districtPositions = this.districtLayouter.layoutOrganic(districts)
                break
            case 'linear':
                this.districtPositions = this.districtLayouter.layoutLinear(districts)
                break
        }

        // Generate building layouts within each district
        districts.forEach(district => {
            this.layoutBuildingsInDistrict(district)
        })

        // Resolve any overlaps
        const result = this.collisionResolver.resolveDistrictCollisions(this.districtPositions)
        this.districtPositions = result.positions
        this.cityBounds = result.bounds
    }

    private layoutBuildingsInDistrict(
        district: District,
        strategy: BuildingLayoutStrategy = 'grid'
    ): void {
        const buildings = this.getBuildings(district)
        const districtPos = this.districtPositions.get(district.spec.id)
        if (!districtPos || buildings.length === 0) return

        const districtRng = this.rng.fork(`buildings:${district.spec.id}`)
        let positions: Map<string, BuildingPosition>

        switch (strategy) {
            case 'grid':
                positions = this.buildingLayouter.layoutGrid(buildings, districtPos, districtRng)
                break
            case 'packed':
                positions = this.buildingLayouter.layoutPacked(buildings, districtPos, districtRng)
                break
            case 'scattered':
                positions = this.buildingLayouter.layoutScattered(buildings, districtPos, districtRng)
                break
            case 'street':
                positions = this.buildingLayouter.layoutStreet(buildings, districtPos, districtRng)
                break
            default:
                positions = this.buildingLayouter.layoutGrid(buildings, districtPos, districtRng)
        }

        // Merge into main positions map
        positions.forEach((pos, id) => this.buildingPositions.set(id, pos))

        // Resolve collisions
        this.collisionResolver.resolveBuildingCollisions(buildings, this.buildingPositions, districtPos)
    }

    // ==========================================================================
    // SIZE CALCULATIONS
    // ==========================================================================

    private calculateDistrictSize(district: District): { width: number; height: number } {
        const buildings = this.getBuildings(district)

        if (buildings.length === 0) {
            return { width: 200, height: 160 }
        }

        // Calculate total area needed by summing actual building sizes
        let totalBuildingArea = 0
        buildings.forEach(building => {
            const size = this.calculateBuildingSize(building)
            // Add spacing around each building (40px on each side = 80px total per dimension)
            const spacing = 80
            totalBuildingArea += (size.width + spacing) * (size.height + spacing)
        })

        // Calculate side length assuming square-ish layout
        // Add extra 50% padding for layout flexibility and district margins
        const baseSize = Math.sqrt(totalBuildingArea) * 1.5

        // For grid layouts, also consider the grid arrangement
        const cols = Math.ceil(Math.sqrt(buildings.length))
        const rows = Math.ceil(buildings.length / cols)

        // Average building size for grid calculation
        const avgBuildingWidth = 70  // approximate average
        const gridSpacing = 130  // Increased spacing
        const gridWidth = cols * (avgBuildingWidth + gridSpacing)
        const gridHeight = rows * (avgBuildingWidth + gridSpacing)

        // Use the larger of area-based or grid-based calculation
        const minWidth = Math.max(baseSize, gridWidth, 250)
        const minHeight = Math.max(baseSize * 0.8, gridHeight, 200)

        // Add some randomness for visual variety
        const rngVariance = this.rng.fork(district.spec.id)

        return {
            width: minWidth + rngVariance.range(-20, 20),
            height: minHeight + rngVariance.range(-15, 15),
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

    // ==========================================================================
    // DATA ACCESSORS
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
