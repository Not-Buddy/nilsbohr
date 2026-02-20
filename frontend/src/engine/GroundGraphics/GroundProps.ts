import { Container, Assets, Texture, Rectangle, Sprite } from 'pixi.js'

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
  allowedTerrain: string[]
}

const terrainDensity = {
  "grass": 0.05,
  "sand": 0.03,
  "stone": 0.03,
  "water": 0.001
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
      chance: 0.003,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.medTree = {
      texture: getTile(12, 20, 5, 8),
      chance: 0.015,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.bigTree = {
      texture: getTile(17, 21, 8, 10),
      chance: 0.001,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.mossyStump = {
      texture: getTile(12, 28, 5, 3),
      chance: 0.003,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    // ===== ROCKS =====
    this.rock = {
      texture: getTile(15, 4),
      chance: 0.003,
      anchorY: 1,
      allowedTerrain: ['grass', 'stone']
    }

    this.bigRock = {
      texture: getTile(15, 4),
      chance: 0.002,
      anchorY: 1,
      allowedTerrain: ['stone']
    }

    this.aquaRock = {
      texture: getTile(15, 4),
      chance: 0.0003,
      anchorY: 1,
      allowedTerrain: ['water']
    }

    // ===== BUSHES =====
    this.bush = {
      texture: getTile(15, 4),
      chance: 0.05,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.bigBush = {
      texture: getTile(12, 0, 2, 1),
      chance: 0.03,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.deadBush = {
      texture: getTile(15, 4),
      chance: 0.02,
      anchorY: 1,
      allowedTerrain: ['sand']
    }

    // ===== PLANTS =====
    this.flower1 = {
      texture: getTile(15, 4),
      chance: 0.07,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.flower2 = {
      texture: getTile(15, 4),
      chance: 0.07,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.lilac = {
      texture: getTile(15, 4),
      chance: 0.04,
      anchorY: 1,
      allowedTerrain: ['grass']
    }

    this.aquaPlant = {
      texture: getTile(15, 4),
      chance: 0.0003,
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
    terrainType: string
  ) {
    const spawnrand = this.seededRandom(worldX, worldY)
    const density = terrainDensity[terrainType] ?? 0

    if (spawnrand > density) {
      return // no  prop on this tile
    }

    const proprand = this.seededRandom(worldX + 9999, worldY + 9999)

    const prop = this.pickProp(proprand, terrainType)
    if (!prop) return

    const sprite = new Sprite(prop.texture)

    sprite.anchor.set(
      prop.anchorX ?? 0.5,
      prop.anchorY ?? 1
    )

    sprite.x = localX
    sprite.y = localY
    sprite.zIndex = sprite.y

    target.addChild(sprite)
  }

  private pickProp(rand: number, terrain: string): PropSet | null {
    const validProps = this.allProps.filter(p =>
      p.allowedTerrain.includes(terrain)
    )

    if (validProps.length === 0) return null

    // Weighted random selection
    let totalChance = 0
    for (const p of validProps) totalChance += p.chance

    const roll = rand * totalChance

    let cumulative = 0
    for (const p of validProps) {
      cumulative += p.chance
      if (roll <= cumulative) return p
    }

    return null
  }

  private seededRandom(x: number, y: number): number {
    const seed = x * 374761393 + y * 668265263 + this.seed
    let t = (seed ^ (seed >> 13)) * 1274126177
    return ((t ^ (t >> 16)) >>> 0) / 4294967295
  }

}
