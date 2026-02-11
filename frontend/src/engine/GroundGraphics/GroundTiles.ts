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

export class GroundTiles {
  public container = new Container()

  private tilemap = new CompositeTilemap()
  private tileSize: number
  private options: GroundOptions
  private seed: number

  private grassTiles: Texture[] = []
  private sandTiles: Texture[] = []
  private dirtTiles: Texture[] = []
  private rockTiles: Texture[] = []
  // private waterTiles: Texture[] = []
  private mountainTile!: Texture

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
      })

    // 🔧 Adjust these (col,row) pairs to match YOUR sheet

    this.grassTiles = [
      getTile(2, 10),
      getTile(3, 10),
      getTile(2, 11),
      getTile(3, 11),
    ]

    this.sandTiles = [
      getTile(6, 14),
      getTile(7, 14),
      getTile(8, 14),
      getTile(7, 15),
    ]

    this.dirtTiles = [
      getTile(11, 10),
      getTile(12, 10),
      getTile(13, 10),
      getTile(12, 11),
    ]

    this.rockTiles = [
      getTile(6, 10),
      getTile(7, 10),
      getTile(8, 10),
      getTile(7, 11),
    ]

    this.mountainTile = getTile(10, 0)

    const cols = Math.floor(baseTexture.width / this.tileSize)
    const rows = Math.floor(baseTexture.height / this.tileSize)

    console.log("Detected grid:", cols, "cols x", rows, "rows")
  }

  // =========================================================
  // WORLD GENERATION
  // =========================================================

  public getTileForPosition(x: number, y: number): Texture {
    let height = this.getHeight(x, y)

    if (this.options.island) {
      height *= this.getIslandMask(x, y)
    }

    const moisture = this.getMoisture(x, y)

/*     if (height < 0.4) {
      return this.pickStable(this.waterTiles, x, y)
    }
 */
    if (height < 0.45) {
      return this.pickStable(this.grassTiles, x, y)
    }

    if (height > 0.85) {
      return this.mountainTile
    }

    if (height > 0.7) {
      return this.pickStable(this.rockTiles, x, y)
    }

    if (moisture < 0.3) {
      return this.pickStable(this.dirtTiles, x, y)
    }

    return this.pickStable(this.sandTiles, x, y)
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

  private hash(x: number, y: number): number {
    const s = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453
    return s - Math.floor(s)
  }

  private pickStable(array: Texture[], x: number, y: number): Texture {
    const r = this.hash(x, y)
    return array[Math.floor(r * array.length)]
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
