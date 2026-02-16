import { Container, Texture } from 'pixi.js'
import { CompositeTilemap } from '@pixi/tilemap'

export class GroundChunk {
    public container: Container;
    private tilemap: CompositeTilemap;
    private chunkX: number;
    private chunkY: number;
    private chunkSize: number;
    private tileSize: number;

    public waterTiles: { x: number; y: number }[] = [];

    private getTileForPosition: (
        x: number,
        y: number
    ) => {
        base: Texture,
        overlay?: Texture,
        terrain: string
    };

    constructor(
        chunkX: number,
        chunkY: number,
        chunkSize: number,
        tileSize: number,
        getTileForPosition: (
            x: number,
            y: number
        ) => {
            base: Texture,
            overlay?: Texture,
            terrain: string
        }
    ) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkSize = chunkSize;
        this.tileSize = tileSize;
        this.getTileForPosition = getTileForPosition;

        this.container = new Container();
        this.tilemap = new CompositeTilemap();
        this.container.addChild(this.tilemap);

        this.generate();
    }

    private generate() {
        const tilesPerChunk = this.chunkSize / this.tileSize;

        const worldStartX = this.chunkX * this.chunkSize;
        const worldStartY = this.chunkY * this.chunkSize;

        for (let ty = 0; ty < tilesPerChunk; ty++) {
            for (let tx = 0; tx < tilesPerChunk; tx++) {

                const worldX = worldStartX + tx * this.tileSize;
                const worldY = worldStartY + ty * this.tileSize;

                const tileData = this.getTileForPosition(worldX, worldY);
                if (!tileData) continue;

                const localX = tx * this.tileSize;
                const localY = ty * this.tileSize;

                // 1️⃣ Draw base terrain tile (always full tile)
                this.tilemap.tile(
                    tileData.base,
                    localX,
                    localY
                );

                // Track water for collision
                if (tileData.terrain === 'water') {
                    this.waterTiles.push({
                        x: worldX,
                        y: worldY
                    });
                }

                // 2️⃣ Draw overlay edge tile (if exists)
                if (tileData.overlay && tileData.overlay !== Texture.EMPTY) {
                    this.tilemap.tile(
                        tileData.overlay,
                        localX,
                        localY
                    );
                }
            }
        }

        this.container.position.set(worldStartX, worldStartY);
    }

    destroy() {
        this.container.destroy({ children: true });
    }
}
