import { Container, Assets, Texture, Rectangle, Sprite } from 'pixi.js'
import type { WorldTerrainType } from '../../types/Types'

export interface GroundPropsOptions {
  tileSize?: number
  tilesetPath: string
  seed?: number
}

interface PropSet {
  texture: Texture
  chance: number
  anchorX?: number
  anchorY?: number
  allowedTerrain: WorldTerrainType[]
}

const terrainDensity : Record<WorldTerrainType, number> = {
  grass : 0.03,
  sand : 0.002,
  water : 0.003,
  stone : 0.0,
}

export class GroundProps {

  private tileSize: number
  private seed: number
  private options: GroundPropsOptions

  // All props
  private smallTree!: PropSet
  private medTree!: PropSet
  private bigTree!: PropSet
  private mossyStump!: PropSet

  private rock!: PropSet
  private bigRock!: PropSet
  private aquaRock!: PropSet

  private bush!: PropSet
  private bigBush!: PropSet
  private deadBush!: PropSet

  private flower1!: PropSet
  private flower2!: PropSet
  private lilac!: PropSet
  private aquaPlant!: PropSet

  // Internal collection
  private allProps: PropSet[] = []
  //private placedProps: {x:number,y:number,radius:number}[] = []

  constructor(options: GroundPropsOptions) {
    this.options = options
    this.tileSize = options.tileSize ?? 16
    this.seed = options.seed ?? 1337

  }

  async load() {
    const baseTexture = await Assets.load(this.options.tilesetPath)

    const getTile = (col: number, row: number, w = 1, h = 1) =>
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(
          col * this.tileSize,
          row * this.tileSize,
          w * this.tileSize,
          h * this.tileSize
        )
      })

    // ===== TREES =====
    this.smallTree = {
      texture: getTile(14, 32, 4, 7),
      chance: 2,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.medTree = {
      texture: getTile(12, 20, 5, 8),
      chance: 3,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.bigTree = {
      texture: getTile(17, 21, 8, 10),
      chance: 2,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.mossyStump = {
      texture: getTile(12, 28, 5, 3),
      chance: 1,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    // ===== ROCKS =====
    this.rock = {
      texture: getTile(19, 33, 1, 1),
      chance: 2,
      anchorY: 1,
      allowedTerrain: ['grass', 'sand']
    }

    this.bigRock = {
      texture: getTile(19, 34, 2, 2),
      chance: 1,
      anchorY: 1,
      allowedTerrain: ['grass', 'sand']
    }

    this.aquaRock = {
      texture: getTile(20, 32, 2, 2),
      chance: 1,
      anchorY: 1,
      allowedTerrain: ['water']
    }

    // ===== BUSHES =====
    this.bush = {
      texture: getTile(18, 37, 3, 2),
      chance: 6,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.bigBush = {
      texture: getTile(18, 39, 3, 2),
      chance: 3,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.deadBush = {
      texture: getTile(21, 38, 3, 2),
      chance: 8,
      anchorY: 1,
      allowedTerrain: ['sand']
    }

    // ===== PLANTS =====
    this.flower1 = {
      texture: getTile(22, 34, 1, 1),
      chance: 10,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.flower2 = {
      texture: getTile(22, 33, 1, 1),
      chance: 14,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.lilac = {
      texture: getTile(23, 33, 2, 3),
      chance: 3,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.aquaPlant = {
      texture: getTile(22, 35, 1, 2),
      chance: 6,
      anchorY: 1,
      allowedTerrain: ['water']
    }

    // Collect everything
    this.allProps = [
      this.smallTree,
      this.medTree,
      this.bigTree,
      this.mossyStump,
      this.rock,
      this.bigRock,
      this.aquaRock,
      this.bush,
      this.bigBush,
      this.deadBush,
      this.flower1,
      this.flower2,
      this.lilac,
      this.aquaPlant
    ]
  }

  public tryPlaceProp(
    target: Container,
    worldX: number,
    worldY: number,
    localX: number,
    localY: number,
    terrainType: WorldTerrainType
  ) {
    const spawnrand = this.seededRandom(worldX, worldY) 
    const density = terrainDensity[terrainType] ?? 0
    const noise = this.densityNoise(worldX, worldY)
    const cluster = this.clusterNoise(worldX, worldY)

    const biome = this.biomeNoise(worldX, worldY)
    const subBiome = this.subBiomeNoise(worldX, worldY)

    let biomeModifier = 1

    const placementField = this.seededRandom(
      Math.floor(worldX * 0.3),
      Math.floor(worldY * 0.3)
    )

    if (placementField > 0.55) return

    if (terrainType === 'grass') {
      if (biome < 0.3) biomeModifier = 0.3      // plains
      else if (biome < 0.65) biomeModifier = 1.0 // mixed
      else biomeModifier = 1.8                  // forest
    }

    if (terrainType === 'sand') {
      biomeModifier = biome > 0.6 ? 0.2 : 1.2   // dunes vs desert flats
    }

    const finalDensity =
      density *
      biomeModifier *
      (0.4 + cluster * 0.8) *
      (0.6 + subBiome)

    if (noise > finalDensity) return

    const proprand = this.seededRandom(worldX + 9999, worldY + 9999)

    const prop = this.pickProp(proprand, terrainType, biome)
    if (!prop) return

    const sprite = new Sprite(prop.texture)

    sprite.anchor.set(
      prop.anchorX ?? 0.5,
      prop.anchorY ?? 1
    )

    const jitter = this.tileSize * 0.35

    sprite.x = localX + (proprand - 0.5) * jitter
    sprite.y = localY + (spawnrand - 0.5) * jitter
    sprite.zIndex = sprite.y

    target.addChild(sprite)
  }

  private pickProp(
    rand: number,
    terrain: WorldTerrainType,
    biome: number
  ): PropSet | null {

    const validProps = this.allProps.filter(p =>
      p.allowedTerrain.includes(terrain)
    )

    if (!validProps.length) return null

    // Apply biome weights
    const weighted = validProps.map(p => {
      let weight = p.chance

      // Dense forest
      if (terrain === 'grass' && biome > 0.65) {
        if (p === this.bigTree || p === this.medTree)
          weight *= 3
      }

      // Flower meadow
      if (terrain === 'grass' && biome < 0.3) {
        if (p === this.flower1 || p === this.flower2)
          weight *= 3
        if (p === this.bigTree)
          weight *= 0.2
      }

      return { prop: p, weight }
    })

    const total = weighted.reduce((s, w) => s + w.weight, 0)
    const roll = rand * total

    let acc = 0
    for (const w of weighted) {
      acc += w.weight
      if (roll <= acc) return w.prop
    }

    return weighted[0].prop
  }

  private seededRandom(x: number, y: number): number {
    const seed = x * 374761393 + y * 668265263 + this.seed
    let t = (seed ^ (seed >> 13)) * 1274126177
    return ((t ^ (t >> 16)) >>> 0) / 4294967295
  }

  private densityNoise(x: number, y: number) {
    const scale = 0.07
    return this.seededRandom(
      Math.floor(x * scale),
      Math.floor(y * scale)
    )
  }

  private clusterNoise(x: number, y: number) {
    const scale = 0.02
    return this.seededRandom(
      Math.floor(x * scale + 5000),
      Math.floor(y * scale + 5000)
    )
  }

  private biomeNoise(x: number, y: number) {
    const scale = 0.002 // VERY LARGE SCALE
    return this.seededRandom(
      Math.floor(x * scale),
      Math.floor(y * scale)
    )
  }

  private subBiomeNoise(x: number, y: number) {
    const scale = 0.006
    return this.seededRandom(
      Math.floor(x * scale + 2000),
      Math.floor(y * scale + 2000)
    )
  }

}
