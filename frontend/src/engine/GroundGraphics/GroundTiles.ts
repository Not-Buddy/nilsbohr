import { Container, Assets, Texture, Rectangle } from 'pixi.js'
import { CompositeTilemap } from '@pixi/tilemap'

export interface GroundOptions {
  worldX: number
  worldY: number
  worldWidth: number
  worldHeight: number
  tileSize?: number
  tilesetPath: string
  seed?: number
  island?: boolean
}

type TerrainType = 'grass' | 'sand' | 'stone' | 'water';


interface AutoTileSet {
  tiles: Record<string, Texture>
}


export class GroundTiles {
  public container = new Container()

  private tilemap = new CompositeTilemap()
  private tileSize: number
  private options: GroundOptions
  private seed: number
  private grass!: AutoTileSet
  private sand!: AutoTileSet
  private stone!: AutoTileSet
  private water!: AutoTileSet


  constructor(options: GroundOptions) {
    this.options = options
    this.tileSize = options.tileSize ?? 16
    this.seed = options.seed ?? 1337
    this.container.addChild(this.tilemap)
  }

  // =========================================================
  // LOAD TILESET AND BUILD TEXTURE GROUPS
  // =========================================================

  async load() {
    const baseTexture = await Assets.load(this.options.tilesetPath)

    const getTile = (col: number, row: number) =>
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(
          col * this.tileSize,
          row * this.tileSize,
          this.tileSize,
          this.tileSize
        )
      });
    
    // All of these are (col, row) *****
    this.grass = {
      tiles:{
        'main' : getTile(2, 10),
        'top' : getTile(2, 9),
        'bottom' : getTile(2, 5),
        'left' : getTile(4, 7),
        'right' : getTile(0, 7),
        'topleft' : getTile(4, 8),
        'topright' : getTile(0, 8),
        'bottomleft' : getTile(4, 6),
        'bottomright' : getTile(0, 6),
      }
    }

    this.sand = {
      tiles:{
        'main' : getTile(7, 18),
        'top' : getTile(7, 17),
        'bottom' : getTile(7, 21),
        'left' : getTile(5, 19),
        'right' : getTile(9, 19),
        'topleft' : getTile(5, 18),
        'topright' : getTile(9, 18),
        'bottomleft' : getTile(5, 20),
        'bottomright' : getTile(9, 20),
      }
    }

    this.stone = {
      tiles:{
        'main' : getTile(7, 10),
        'top' : getTile(7, 9),
        'bottom' : getTile(7, 5),
        'left' : getTile(9, 2),
        'right' : getTile(5, 2),
        'topleft' : getTile(8, 4),
        'topright' : getTile(6, 3),
        'bottomleft' : getTile(8, 1),
        'bottomright' : getTile(6, 1),
      }
    }

    this.water = {
      tiles:{
        'main' : getTile(22, 7),
        'top' : getTile(22, 5),
        'bottom' : getTile(22, 9),
        'left' : getTile(20, 7),
        'right' : getTile(24, 7),
        'topleft' : getTile(21, 5),
        'topright' : getTile(23, 5),
        'bottomleft' : getTile(21, 9),
        'bottomright' : getTile(23, 9),
      }
    }

    const cols = Math.floor(baseTexture.width / this.tileSize)
    const rows = Math.floor(baseTexture.height / this.tileSize)

    console.log("Detected grid:", cols, "cols x", rows, "rows")
  }

  private getTerrainType(x: number, y: number): TerrainType {
    let height = this.getHeight(x, y)

    if (this.options.island) {
      height *= this.getIslandMask(x, y)
    }

    const moisture = this.getMoisture(x, y)

    if (height < 0.25) return 'water'
    if (height < 0.45) return 'sand'
    if (height > 0.75) return 'stone'

    return 'grass'
  }

  public getTileForPosition(x: number, y: number): Texture {
    const size = this.tileSize

    const type = this.getTerrainType(x, y)

    const top    = this.getTerrainType(x, y - size)
    const bottom = this.getTerrainType(x, y + size)
    const left   = this.getTerrainType(x - size, y)
    const right  = this.getTerrainType(x + size, y)

    const set = this.getTileSet(type).tiles

    const sameTop = top === type
    const sameBottom = bottom === type
    const sameLeft = left === type
    const sameRight = right === type

    // --- Full surround ---
    if (sameTop && sameBottom && sameLeft && sameRight) {
      return set.main
    }

    // --- Single edges ---
    if (!sameTop && sameLeft && sameRight) return set.top
    if (!sameBottom && sameLeft && sameRight) return set.bottom
    if (!sameLeft && sameTop && sameBottom) return set.left
    if (!sameRight && sameTop && sameBottom) return set.right

    // --- Corners ---
    if (!sameTop && !sameLeft) return set.topleft
    if (!sameTop && !sameRight) return set.topright
    if (!sameBottom && !sameLeft) return set.bottomleft
    if (!sameBottom && !sameRight) return set.bottomright

    // --- Fallback ---
    return set.main
  }

  // =========================================================
  // HEIGHT MAP
  // =========================================================

  private getHeight(x: number, y: number): number {
    const s1 = 0.0012
    const s2 = 0.0025
    const s3 = 0.005

    const e =
      Math.sin((x + this.seed) * s1) +
      Math.cos((y - this.seed) * s1) +
      Math.sin((x + y) * s2) * 0.5 +
      Math.sin((x - y) * s3) * 0.25

    return (e + 3) / 6
  }

  // =========================================================
  // MOISTURE MAP
  // =========================================================

  private getMoisture(x: number, y: number): number {
    const scale = 0.002
    const m = Math.sin((x + 999) * scale) + Math.cos((y - 999) * scale)
    return (m + 2) / 4
  }

  // =========================================================
  // ISLAND MASK
  // =========================================================

  private getIslandMask(x: number, y: number): number {
    const cx = this.options.worldX + this.options.worldWidth / 2
    const cy = this.options.worldY + this.options.worldHeight / 2

    const dx = (x - cx) / this.options.worldWidth
    const dy = (y - cy) / this.options.worldHeight

    const dist = Math.sqrt(dx * dx + dy * dy)

    return Math.max(0, 1 - dist * 1.5)
  }

  // =========================================================
  // STABLE RANDOM PICK
  // =========================================================

  private getTileSet(type: TerrainType): AutoTileSet {
    switch (type) {
      case 'grass': return this.grass
      case 'sand': return this.sand
      case 'stone': return this.stone
      case 'water': return this.water
    }
  }


  destroy() {
    this.container.destroy({ children: true })
  }
}
