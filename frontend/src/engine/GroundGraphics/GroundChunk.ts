import { Container, Texture } from 'pixi.js'
import { CompositeTilemap } from '@pixi/tilemap'

export class GroundChunk {
    public container: Container;
    private tilemap: CompositeTilemap;
    private chunkX: number;
    private chunkY: number;
    private chunkSize: number;
    private tileSize: number;
    private getTileForPosition: (x: number, y: number) => Texture;
    private getBaseTexture: (x: number, y: number) => Texture;

    constructor(
        chunkX: number,
        chunkY: number,
        chunkSize: number,
        tileSize: number,
        getBaseTexture: (x: number, y: number) => Texture,
        getTileForPosition: (x: number, y: number) => Texture
    ) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkSize = chunkSize;
        this.tileSize = tileSize;
        this.getBaseTexture = getBaseTexture;
        this.getTileForPosition = getTileForPosition;
        
        this.container = new Container();
        this.tilemap = new CompositeTilemap();
        
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
                

                const baseTexture = this.getBaseTexture(worldX, worldY);
                this.tilemap.tile(
                    baseTexture,
                    tx * this.tileSize,
                    ty * this.tileSize
                )
                
                const texture = this.getTileForPosition(worldX, worldY);
                if (texture !== Texture.EMPTY) {
                this.tilemap.tile(
                    texture,
                    tx * this.tileSize,
                    ty * this.tileSize  
                );
            }
            }
        }

        this.container.position.set(worldStartX, worldStartY)
    }

    destroy() {
        this.container.destroy({ children: true })
    }
}
