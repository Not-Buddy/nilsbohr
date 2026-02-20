import { Container, Texture } from 'pixi.js'
import { CompositeTilemap } from '@pixi/tilemap'
import { GroundProps } from './GroundProps'


export class GroundChunk {
    public container: Container;
    private tilemap: CompositeTilemap;
    private propsLayer: Container
    private chunkX: number;
    private chunkY: number;
    private chunkSize: number;
    private tileSize: number;
    private props!: GroundProps;

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
        },
        props: GroundProps
    ) {
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.chunkSize = chunkSize;
        this.tileSize = tileSize;
        this.getTileForPosition = getTileForPosition;
        this.props = props;
        this.container = new Container();
        this.tilemap = new CompositeTilemap();
        this.container.addChild(this.tilemap);

        this.propsLayer = new Container();
        this.propsLayer.sortableChildren = true;
        this.container.addChild(this.propsLayer)

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

                //Draw base terrain tile (always full tile)
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

                // Draw overlay edge tile (if exists)
                if (tileData.overlay && tileData.overlay !== Texture.EMPTY) {
                    this.tilemap.tile(
                        tileData.overlay,
                        localX,
                        localY
                    );
                }
                
                // prop objects
                this.props.tryPlaceProp(
                    this.propsLayer,
                    worldX,
                    worldY,
                    localX,
                    localY,
                    tileData.terrain
                )

            }
        }


        this.container.position.set(worldStartX, worldStartY);
    }

    destroy() {
        this.container.destroy({ children: true });
    }
}
