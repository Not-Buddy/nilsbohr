// engine/ChunkManager.ts
// Progressive chunk-based loading system for large worlds

import { Container } from 'pixi.js'
import type { City } from '../types/SeedTypes'
import type { WorldGenerator, CityPosition } from './WorldGenerator'
import { createCitySprite } from '../sprites/City'

interface Chunk {
    id: string
    x: number
    y: number
    container: Container
    loaded: boolean
    cityIds: string[]
}

interface ChunkCoord {
    chunkX: number
    chunkY: number
}

/**
 * Manages world chunks for progressive loading/unloading.
 * Only renders chunks near the player, improving performance.
 */
export class ChunkManager {
    private chunks: Map<string, Chunk> = new Map()
    private chunkSize: number
    private loadRadius: number
    private unloadRadius: number
    private parentContainer: Container
    private cities: Map<string, City> = new Map()
    private cityPositions: Map<string, CityPosition> = new Map()
    private loadedCitySprites: Map<string, Container> = new Map()

    constructor(
        parentContainer: Container,
        options: {
            chunkSize?: number
            loadRadius?: number
            unloadRadius?: number
        } = {}
    ) {
        this.parentContainer = parentContainer
        this.chunkSize = options.chunkSize ?? 1000
        this.loadRadius = options.loadRadius ?? 2
        this.unloadRadius = options.unloadRadius ?? 3
    }

    /**
     * Initialize the chunk manager with city data and positions.
     */
    setCities(cities: City[], generator: WorldGenerator): void {
        this.cities.clear()
        this.cityPositions.clear()

        for (const city of cities) {
            this.cities.set(city.spec.id, city)
        }

        this.cityPositions = generator.getAllCityPositions()

        // Pre-calculate which cities belong to which chunks
        this.assignCitiesToChunks()
    }

    /**
     * Assign cities to their respective chunks based on position.
     */
    private assignCitiesToChunks(): void {
        for (const [cityId, position] of this.cityPositions) {
            const chunkCoord = this.worldToChunk(position.x, position.y)
            const chunkId = this.getChunkId(chunkCoord.chunkX, chunkCoord.chunkY)

            let chunk = this.chunks.get(chunkId)
            if (!chunk) {
                chunk = this.createChunk(chunkCoord.chunkX, chunkCoord.chunkY)
                this.chunks.set(chunkId, chunk)
            }

            chunk.cityIds.push(cityId)
        }
    }

    /**
     * Convert world coordinates to chunk coordinates.
     */
    private worldToChunk(x: number, y: number): ChunkCoord {
        return {
            chunkX: Math.floor(x / this.chunkSize),
            chunkY: Math.floor(y / this.chunkSize),
        }
    }

    /**
     * Get a unique ID for a chunk.
     */
    private getChunkId(chunkX: number, chunkY: number): string {
        return `${chunkX}_${chunkY}`
    }

    /**
     * Create an empty chunk.
     */
    private createChunk(chunkX: number, chunkY: number): Chunk {
        return {
            id: this.getChunkId(chunkX, chunkY),
            x: chunkX,
            y: chunkY,
            container: new Container(),
            loaded: false,
            cityIds: [],
        }
    }

    /**
     * Update chunks based on player position.
     * Call this every frame.
     */
    update(playerX: number, playerY: number): void {
        const playerChunk = this.worldToChunk(playerX, playerY)

        // Load nearby chunks
        for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
            for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
                const chunkX = playerChunk.chunkX + dx
                const chunkY = playerChunk.chunkY + dy
                const chunkId = this.getChunkId(chunkX, chunkY)

                const chunk = this.chunks.get(chunkId)
                if (chunk && !chunk.loaded) {
                    this.loadChunk(chunk)
                }
            }
        }

        // Unload distant chunks
        for (const [_chunkId, chunk] of this.chunks) {
            if (!chunk.loaded) continue

            const dx = Math.abs(chunk.x - playerChunk.chunkX)
            const dy = Math.abs(chunk.y - playerChunk.chunkY)

            if (dx > this.unloadRadius || dy > this.unloadRadius) {
                this.unloadChunk(chunk)
            }
        }
    }

    /**
     * Load a chunk and its entities.
     */
    private loadChunk(chunk: Chunk): void {
        if (chunk.loaded) return
        chunk.loaded = true

        for (const cityId of chunk.cityIds) {
            const city = this.cities.get(cityId)
            const position = this.cityPositions.get(cityId)

            if (!city || !position) continue
            if (this.loadedCitySprites.has(cityId)) continue

            const sprite = createCitySprite(city)
            sprite.x = position.x
            sprite.y = position.y
                ; (sprite as any).__city = city

            chunk.container.addChild(sprite)
            this.loadedCitySprites.set(cityId, sprite)
        }

        this.parentContainer.addChild(chunk.container)
    }

    /**
     * Unload a chunk and its entities.
     */
    private unloadChunk(chunk: Chunk): void {
        if (!chunk.loaded) return
        chunk.loaded = false

        for (const cityId of chunk.cityIds) {
            this.loadedCitySprites.delete(cityId)
        }

        this.parentContainer.removeChild(chunk.container)
        chunk.container.destroy({ children: true })
        chunk.container = new Container()
    }

    /**
     * Force load all chunks (for small worlds).
     */
    loadAll(): void {
        for (const chunk of this.chunks.values()) {
            if (!chunk.loaded) {
                this.loadChunk(chunk)
            }
        }
    }

    /**
     * Get the city sprite container for collision detection.
     */
    getLoadedCitySprites(): Map<string, Container> {
        return this.loadedCitySprites
    }

    /**
     * Clean up all chunks.
     */
    destroy(): void {
        for (const chunk of this.chunks.values()) {
            if (chunk.loaded) {
                this.unloadChunk(chunk)
            }
        }
        this.chunks.clear()
        this.cities.clear()
        this.cityPositions.clear()
        this.loadedCitySprites.clear()
    }
}
