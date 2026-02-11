import { Container, Texture } from 'pixi.js'
import { CompositeTilemap } from '@pixi/tilemap'
import type { GroundOptions } from './GroundTiles'

export class GroundChunk {
    public container = new Container();
    private tilemap = new CompositeTilemap();

    constructor(
        private chunkX: number,
        private chunkY: number,
        private chunkSize: number,
        private tileSize: number,
        private getTileForPosition: (x: number, y: number) => Texture
    ) {
        this.container.addChild(this.tilemap)
        this.generate()
    }

    private generate() {
        const tilesPerChunk = this.chunkSize / this.tileSize

        const worldStartX = this.chunkX * this.chunkSize
        const worldStartY = this.chunkY * this.chunkSize

        for (let ty = 0; ty < tilesPerChunk; ty++) {
        for (let tx = 0; tx < tilesPerChunk; tx++) {

            const worldX = worldStartX + tx * this.tileSize
            const worldY = worldStartY + ty * this.tileSize

            const texture = this.getTileForPosition(worldX, worldY)

            this.tilemap.tile(
            texture,
            tx * this.tileSize,
            ty * this.tileSize
            )
        }
        }

        this.container.position.set(worldStartX, worldStartY)
    }

    destroy() {
        this.container.destroy({ children: true })
    }
}
