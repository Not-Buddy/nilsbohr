// engine/CityGenerator/BiomeConfig.ts
// Biome type definitions, color palettes, and district assignment

import type { SeededRandom } from '../SeededRandom'

export type BiomeType = 'forest' | 'desert' | 'tundra' | 'volcanic' | 'crystal' | 'tech'

export interface BiomePalette {
    name: string
    type: BiomeType

    // Ground
    groundColor: number
    groundPatternColor: number
    groundPatternAlpha: number
    patternType: 'grid' | 'hex' | 'dots' | 'diagonal'
    tileSize: number

    // Buildings
    buildingFill: number
    buildingFillAlpha: number
    buildingStroke: number
    buildingStrokeAlpha: number
    accentColor: number

    // Shape
    buildingShape: 'rect' | 'rounded' | 'diamond'

    // District border
    borderColor: number
    borderAlpha: number
}

const BIOME_PALETTES: Record<BiomeType, BiomePalette> = {
    forest: {
        name: 'Forest',
        type: 'forest',
        groundColor: 0x1b3a1b,
        groundPatternColor: 0x2d5a27,
        groundPatternAlpha: 0.4,
        patternType: 'dots',
        tileSize: 40,
        buildingFill: 0x3e2723,
        buildingFillAlpha: 1,
        buildingStroke: 0x5d4037,
        buildingStrokeAlpha: 0.9,
        accentColor: 0x66bb6a,
        buildingShape: 'rounded',
        borderColor: 0x4caf50,
        borderAlpha: 0.5,
    },

    desert: {
        name: 'Desert',
        type: 'desert',
        groundColor: 0x3e2f1c,
        groundPatternColor: 0x5c4a2a,
        groundPatternAlpha: 0.35,
        patternType: 'diagonal',
        tileSize: 50,
        buildingFill: 0xbf8040,
        buildingFillAlpha: 1,
        buildingStroke: 0xd4a055,
        buildingStrokeAlpha: 0.85,
        accentColor: 0xffb74d,
        buildingShape: 'rect',
        borderColor: 0xffa726,
        borderAlpha: 0.45,
    },

    tundra: {
        name: 'Tundra',
        type: 'tundra',
        groundColor: 0x1a2a3a,
        groundPatternColor: 0x2a4060,
        groundPatternAlpha: 0.3,
        patternType: 'hex',
        tileSize: 35,
        buildingFill: 0x78909c,
        buildingFillAlpha: 1,
        buildingStroke: 0x90caf9,
        buildingStrokeAlpha: 0.8,
        accentColor: 0x81d4fa,
        buildingShape: 'rounded',
        borderColor: 0x64b5f6,
        borderAlpha: 0.4,
    },

    volcanic: {
        name: 'Volcanic',
        type: 'volcanic',
        groundColor: 0x1a1010,
        groundPatternColor: 0x3d1a1a,
        groundPatternAlpha: 0.45,
        patternType: 'grid',
        tileSize: 45,
        buildingFill: 0x37474f,
        buildingFillAlpha: 1,
        buildingStroke: 0xff6d00,
        buildingStrokeAlpha: 0.75,
        accentColor: 0xff3d00,
        buildingShape: 'rect',
        borderColor: 0xff6d00,
        borderAlpha: 0.5,
    },

    crystal: {
        name: 'Crystal',
        type: 'crystal',
        groundColor: 0x1a0a2e,
        groundPatternColor: 0x3a1a5e,
        groundPatternAlpha: 0.35,
        patternType: 'hex',
        tileSize: 30,
        buildingFill: 0x7e57c2,
        buildingFillAlpha: 0.95,
        buildingStroke: 0xce93d8,
        buildingStrokeAlpha: 0.85,
        accentColor: 0xea80fc,
        buildingShape: 'diamond',
        borderColor: 0xba68c8,
        borderAlpha: 0.5,
    },

    tech: {
        name: 'Tech',
        type: 'tech',
        groundColor: 0x0a1a0a,
        groundPatternColor: 0x1b3a1b,
        groundPatternAlpha: 0.5,
        patternType: 'grid',
        tileSize: 32,
        buildingFill: 0x455a64,
        buildingFillAlpha: 1,
        buildingStroke: 0x76ff03,
        buildingStrokeAlpha: 0.7,
        accentColor: 0x76ff03,
        buildingShape: 'rect',
        borderColor: 0x76ff03,
        borderAlpha: 0.35,
    },
}

const ALL_BIOMES: BiomeType[] = ['forest', 'desert', 'tundra', 'volcanic', 'crystal', 'tech']

/**
 * Deterministically assign a biome to a district based on its index.
 * Uses seeded random for consistency across loads.
 */
export function getBiomeForDistrict(districtIndex: number, rng: SeededRandom): BiomeType {
    const districtRng = rng.fork(`biome:${districtIndex}`)
    const roll = districtRng.range(0, ALL_BIOMES.length)
    return ALL_BIOMES[Math.floor(roll) % ALL_BIOMES.length]
}

/**
 * Assign biomes to all districts and return a map of districtId → palette.
 */
export function assignBiomes(
    districts: { spec: { id: string } }[],
    rng: SeededRandom
): Map<string, BiomePalette> {
    const map = new Map<string, BiomePalette>()

    districts.forEach((district, index) => {
        const biomeType = getBiomeForDistrict(index, rng)
        map.set(district.spec.id, BIOME_PALETTES[biomeType])
    })

    return map
}

/** Get a palette by biome type */
export function getBiomePalette(type: BiomeType): BiomePalette {
    return BIOME_PALETTES[type]
}

export { BIOME_PALETTES }
