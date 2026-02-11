import { Container } from 'pixi.js'
import { GroundChunk } from './GroundChunk'

export class GroundChunkManager {
  private chunks = new Map<string, GroundChunk>()

  constructor(
    private parent: Container,
    private chunkSize: number,
    private tileSize: number,
    private loadRadius: number,
    private getTileForPosition: (x: number, y: number) => any
  ) {}

  private getChunkId(x: number, y: number) {
    return `${x}_${y}`
  }

  private worldToChunk(x: number, y: number) {
    return {
      chunkX: Math.floor(x / this.chunkSize),
      chunkY: Math.floor(y / this.chunkSize),
    }
  }

  update(playerX: number, playerY: number) {
    const center = this.worldToChunk(playerX, playerY)

    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
      for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {

        const cx = center.chunkX + dx
        const cy = center.chunkY + dy
        const id = this.getChunkId(cx, cy)

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
  }
}
