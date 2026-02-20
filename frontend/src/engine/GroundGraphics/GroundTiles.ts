import { Assets, Texture, Rectangle } from 'pixi.js'
import { Terrain } from './Terrain'

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

type TerrainType = 'grass' | 'sand' | 'stone' | 'water'

interface AutoTileSet {
  base: Texture
  tiles: Record<string, Texture>
}

export class GroundTiles {
  private tileSize: number;
  private options: GroundOptions;
  private seed: number;

  private grass!: AutoTileSet;
  private sand!: AutoTileSet;
  private stone!: AutoTileSet;
  private water!: AutoTileSet;
  private terrain: Terrain;
  private terrainCache = new Map<string, TerrainType>();

  private worldCenterX: number;
  private worldCenterY: number;
  private maxIslandRadius: number;


  constructor(options: GroundOptions) {
    this.options = options
    this.tileSize = options.tileSize ?? 16
    this.seed = options.seed ?? 1337
    this.worldCenterX = options.worldX + options.worldWidth / 2
    this.worldCenterY = options.worldY + options.worldHeight / 2

    this.maxIslandRadius = Math.min(
      options.worldWidth,
      options.worldHeight
    ) * 0.65

    this.terrain = new Terrain(
      this.seed,
      this.worldCenterX,
      this.worldCenterY,
      this.maxIslandRadius
    )


  }

  // =========================================================
  // TERRAIN PRIORITY (for base blending)
  // =========================================================

  private priority: Record<TerrainType, number> = {
    water: 0,
    sand: 1,
    grass: 2,
    stone: 3,
  }
  
  public isWater(x: number, y: number): boolean {
    return this.getTerrainType(x, y) === 'water'
  }

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

    this.grass = {
      base: getTile(2, 10),
      tiles: {
        main: getTile(2, 10),
        top: getTile(2, 4),
        bottom: getTile(2, 0),
        left: getTile(4, 7),
        right: getTile(0, 7),
        topleft: getTile(1, 4),
        topright: getTile(3, 4),
        bottomleft: getTile(3, 0),
        bottomright: getTile(1, 0),
      }
    }

    this.sand = {
      base: getTile(7, 19),
      tiles: {
        main: getTile(7, 18),
        top: getTile(7, 17),
        bottom: getTile(7, 21),
        left: getTile(5, 19),
        right: getTile(9, 19),
        topleft: getTile(5, 18),
        topright: getTile(9, 18),
        bottomleft: getTile(5, 20),
        bottomright: getTile(9, 20),
      }
    }

    this.stone = {
      base: getTile(8, 10),
      tiles: {
        main: getTile(7, 10),
        top: getTile(7, 9),
        bottom: getTile(7, 5),
        left: getTile(9, 2),
        right: getTile(5, 2),
        topleft: getTile(8, 4),
        topright: getTile(6, 3),
        bottomleft: getTile(8, 1),
        bottomright: getTile(6, 1),
      }
    }

    this.water = {
      base: getTile(24, 4),
      tiles: {
        main: getTile(22, 7),
        top: getTile(22, 5),
        bottom: getTile(22, 9),
        left: getTile(20, 7),
        right: getTile(24, 7),
        topleft: getTile(21, 5),
        topright: getTile(23, 5),
        bottomleft: getTile(21, 9),
        bottomright: getTile(23, 9),
      }
    }
  }

  private getTerrainType(x: number, y: number): TerrainType {
    const key = `${x},${y}`
    const cached = this.terrainCache.get(key)
    if (cached) return cached

    const height = this.terrain.getHeight(x, y)

    let type: TerrainType

    if (height < 0.30) type = 'water'
    else if (height < 0.42) type = 'sand'
    else if (height > 0.75) type = 'stone'
    else type = 'grass'

    this.terrainCache.set(key, type)
    return type
  }


  private getTileSet(type: TerrainType): AutoTileSet {
    switch (type) {
      case 'grass': return this.grass
      case 'sand': return this.sand
      case 'stone': return this.stone
      case 'water': return this.water
    }
  }

  // =========================================================
  // AUTO-TILE LOGIC
  // =========================================================

public getTileForPosition(x: number, y: number): {
  base: Texture
  overlay?: Texture
  terrain: TerrainType
} {
  const size = this.tileSize
  const type = this.getTerrainType(x, y)
  const currentPriority = this.priority[type]

  const top = this.getTerrainType(x, y - size)
  const bottom = this.getTerrainType(x, y + size)
  const left = this.getTerrainType(x - size, y)
  const right = this.getTerrainType(x + size, y)

  const tileSet = this.getTileSet(type)
  const overlaySet = tileSet.tiles

  const lowerTop = this.priority[top] < currentPriority
  const lowerBottom = this.priority[bottom] < currentPriority
  const lowerLeft = this.priority[left] < currentPriority
  const lowerRight = this.priority[right] < currentPriority

  const isBorderingLower =
    lowerTop || lowerBottom || lowerLeft || lowerRight

  //If fully surrounded by same or higher terrain → full tile
  if (!isBorderingLower) {
    return {
      base: overlaySet.main,
      terrain: type
    }
  }

  //Find lowest-priority neighbor to use as base
  const neighbors = [top, bottom, left, right]

  let lowest: TerrainType | null = null

  for (const n of neighbors) {
    if (this.priority[n] < currentPriority) {
      if (!lowest || this.priority[n] < this.priority[lowest]) {
        lowest = n
      }
    }
  }

  const base = this.getTileSet(lowest!).base

  // Corner cases first
  if (lowerTop && lowerLeft) {
    return { base, overlay: overlaySet.topleft, terrain: type }
  }

  if (lowerTop && lowerRight) {
    return { base, overlay: overlaySet.topright, terrain: type }
  }

  if (lowerBottom && lowerLeft) {
    return { base, overlay: overlaySet.bottomleft, terrain: type }
  }

  if (lowerBottom && lowerRight) {
    return { base, overlay: overlaySet.bottomright, terrain: type }
  }

  // Single edge cases
  if (lowerTop) {
    return { base, overlay: overlaySet.top, terrain: type }
  }

  if (lowerBottom) {
    return { base, overlay: overlaySet.bottom, terrain: type }
  }

  if (lowerLeft) {
    return { base, overlay: overlaySet.left, terrain: type }
  }

  if (lowerRight) {
    return { base, overlay: overlaySet.right, terrain: type }
  }

  // fallback
  return {
    base: overlaySet.main,
    terrain: type
  }
}
}
