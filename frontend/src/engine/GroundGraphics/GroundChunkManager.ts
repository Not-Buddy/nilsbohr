import { Container, Texture } from 'pixi.js'
import { GroundChunk } from './GroundChunk'

export class GroundChunkManager {
  private chunks: Map<string, GroundChunk>
  private parent: Container
  private chunkSize: number
  private tileSize: number
  private loadRadius: number

  // Updated return type for System B
  private getTileForPosition: (
    x: number,
    y: number
  ) => {
    base: Texture
    overlay?: Texture
    terrain: string
  }

  constructor(
    parent: Container,
    chunkSize: number,
    tileSize: number,
    loadRadius: number,
    getTileForPosition: (
      x: number,
      y: number
    ) => {
      base: Texture
      overlay?: Texture
      terrain: string
    }
  ) {
    this.parent = parent
    this.chunkSize = chunkSize
    this.tileSize = tileSize
    this.loadRadius = loadRadius
    this.getTileForPosition = getTileForPosition
    this.chunks = new Map<string, GroundChunk>()
  }

  private getChunkId(x: number, y: number) {
    return `${x}_${y}`
  }

  private worldToChunk(x: number, y: number) {
    return {
      chunkX: Math.floor(x / this.chunkSize),
      chunkY: Math.floor(y / this.chunkSize),
    }
  }

  public getWaterCollisionRects() {
    const rects = []

    for (const chunk of this.chunks.values()) {
      for (const tile of chunk.waterTiles) {
        rects.push({
          x: tile.x,
          y: tile.y,
          width: this.tileSize,
          height: this.tileSize,
          enterable: false
        })
      }
    }

    return rects
  }

  update(playerX: number, playerY: number) {
    const center = this.worldToChunk(playerX, playerY)

    const needed = new Set<string>()

    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {

        const cx = center.chunkX + dx
        const cy = center.chunkY + dy
        const id = this.getChunkId(cx, cy)

        needed.add(id)

        if (!this.chunks.has(id)) {

          const chunk = new GroundChunk(
            cx,
            cy,
            this.chunkSize,
            this.tileSize,
            this.getTileForPosition
          )

          this.parent.addChild(chunk.container)
          this.chunks.set(id, chunk)
        }
      }
    }

    // Unload chunks not needed
    for (const [id, chunk] of this.chunks) {
      if (!needed.has(id)) {
        chunk.destroy()
        this.parent.removeChild(chunk.container)
        this.chunks.delete(id)
      }
    }
  }
}
