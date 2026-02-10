// engine/CityGenerator/DistrictLayouter.ts
// District layout strategies

import type { District, Building } from '../../types/SeedTypes'
import type { SeededRandom } from '../SeededRandom'
import type { DistrictPosition, CityBounds } from './types'

export interface DistrictLayouterConfig {
    rng: SeededRandom
    cityBounds: CityBounds
    getBuildings: (district: District) => Building[]
    calculateDistrictSize: (district: District) => { width: number; height: number }
}

export class DistrictLayouter {
    private rng: SeededRandom
    private cityBounds: CityBounds
    private getBuildings: (district: District) => Building[]
    private calculateDistrictSize: (district: District) => { width: number; height: number }

    constructor(config: DistrictLayouterConfig) {
        this.rng = config.rng
        this.cityBounds = config.cityBounds
        this.getBuildings = config.getBuildings
        this.calculateDistrictSize = config.calculateDistrictSize
    }

    /**
     * Radial layout: Districts arranged in concentric rings from center.
     * Larger districts (more buildings) are placed closer to center.
     */
    layoutRadial(districts: District[]): Map<string, DistrictPosition> {
        const positions = new Map<string, DistrictPosition>()
        if (districts.length === 0) return positions

        // Sort by building count (larger districts closer to center)
        const sorted = [...districts].sort((a, b) =>
            this.getBuildings(b).length - this.getBuildings(a).length
        )

        const goldenAngle = Math.PI * (3 - Math.sqrt(5))
        const baseRadius = 200
        const ringSpacing = 300

        sorted.forEach((district, index) => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            const size = this.calculateDistrictSize(district)

            // Fermat spiral placement
            const angle = index * goldenAngle + districtRng.range(-0.15, 0.15)
            const radius = baseRadius + Math.sqrt(index) * ringSpacing + districtRng.range(-50, 50)

            positions.set(district.spec.id, {
                x: this.cityBounds.centerX + Math.cos(angle) * radius,
                y: this.cityBounds.centerY + Math.sin(angle) * radius,
                width: size.width,
                height: size.height,
                rotation: districtRng.range(-0.1, 0.1),
            })
        })

        return positions
    }

    /**
     * Grid layout: Districts arranged in a regular grid pattern.
     */
    layoutGrid(districts: District[]): Map<string, DistrictPosition> {
        const positions = new Map<string, DistrictPosition>()
        if (districts.length === 0) return positions

        const cols = Math.ceil(Math.sqrt(districts.length))
        const cellWidth = this.cityBounds.width / (cols + 1)
        const cellHeight = this.cityBounds.height / (Math.ceil(districts.length / cols) + 1)

        districts.forEach((district, index) => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            const size = this.calculateDistrictSize(district)

            const col = index % cols
            const row = Math.floor(index / cols)

            positions.set(district.spec.id, {
                x: (col + 1) * cellWidth + districtRng.range(-20, 20),
                y: (row + 1) * cellHeight + districtRng.range(-20, 20),
                width: size.width,
                height: size.height,
                rotation: 0,
            })
        })

        return positions
    }

    /**
     * Organic layout: Natural clustering with force-directed placement.
     */
    layoutOrganic(districts: District[]): Map<string, DistrictPosition> {
        const positions = new Map<string, DistrictPosition>()
        if (districts.length === 0) return positions

        // Initial random placement
        const tempPositions: Map<string, { x: number; y: number }> = new Map()
        districts.forEach(district => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            tempPositions.set(district.spec.id, {
                x: this.cityBounds.centerX + districtRng.gaussian(0, this.cityBounds.width / 4),
                y: this.cityBounds.centerY + districtRng.gaussian(0, this.cityBounds.height / 4),
            })
        })

        // Force-directed iterations
        for (let iter = 0; iter < 50; iter++) {
            districts.forEach((districtA, i) => {
                districts.forEach((districtB, j) => {
                    if (i >= j) return

                    const posA = tempPositions.get(districtA.spec.id)!
                    const posB = tempPositions.get(districtB.spec.id)!

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
            const pos = tempPositions.get(district.spec.id)!
            const size = this.calculateDistrictSize(district)
            const districtRng = this.rng.fork(`district:${district.spec.id}`)

            positions.set(district.spec.id, {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                rotation: districtRng.range(-0.15, 0.15),
            })
        })

        return positions
    }

    /**
     * Linear layout: Districts arranged along a main road/axis.
     */
    layoutLinear(districts: District[]): Map<string, DistrictPosition> {
        const positions = new Map<string, DistrictPosition>()
        if (districts.length === 0) return positions

        const spacing = this.cityBounds.width / (districts.length + 1)
        const centerY = this.cityBounds.centerY

        districts.forEach((district, index) => {
            const districtRng = this.rng.fork(`district:${district.spec.id}`)
            const size = this.calculateDistrictSize(district)

            // Alternate above/below the main axis
            const offset = (index % 2 === 0 ? -1 : 1) * (size.height / 2 + 50)

            positions.set(district.spec.id, {
                x: (index + 1) * spacing,
                y: centerY + offset + districtRng.range(-30, 30),
                width: size.width,
                height: size.height,
                rotation: 0,
            })
        })

        return positions
    }
}
