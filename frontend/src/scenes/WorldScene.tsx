// WorldScene.ts
// Updated to use procedural world generation and chunk-based loading

import { Container, Rectangle, Graphics } from 'pixi.js'
import { CityScene } from './CityScene'
import { Player } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { WorldGenerator } from '../engine/WorldGenerator'
import { ChunkManager } from '../engine/ChunkManager'

import type { Scene } from '../types/Types'
import type { City, ProjectResponse, WorldSeed } from '../types/SeedTypes'
import type { SceneManager } from '../engine/SceneManager'


export class WorldScene implements Scene {
  container = new Container()

  private mounted = false
  private transitioning = false
  private player?: Player
  private input?: Input
  private manager: SceneManager
  private camera = new Camera()

  // New: Procedural generation systems
  private generator?: WorldGenerator
  private chunkManager?: ChunkManager

  // Support both old WorldSeed and new ProjectResponse formats
  private projectResponse?: ProjectResponse
  private legacySeed?: WorldSeed

  constructor(seed: WorldSeed | ProjectResponse, manager: SceneManager) {
    this.manager = manager

    // Detect seed format
    if ('project' in seed) {
      this.projectResponse = seed
    } else {
      this.legacySeed = seed
    }
  }

  private getCities(): City[] {
    if (this.projectResponse) {
      return this.projectResponse.cities
    }
    return this.legacySeed?.cities ?? []
  }

  async mount() {
    if (this.mounted) return
    this.mounted = true

    // Add camera container to scene
    this.container.addChild(this.camera.container)

    // Setup world generator
    if (this.projectResponse) {
      this.generator = new WorldGenerator(this.projectResponse.project)
    } else {
      // Fallback for legacy format
      this.generator = new WorldGenerator({
        name: 'LegacyProject',
        generated_at: new Date().toISOString(),
        seed: 'legacy',
        stats: {
          total_cities: this.legacySeed?.cities.length ?? 0,
          total_buildings: this.legacySeed?.world_meta.total_buildings ?? 0,
          total_rooms: this.legacySeed?.world_meta.total_rooms ?? 0,
          total_artifacts: this.legacySeed?.world_meta.total_artifacts ?? 0,
          dominant_language: this.legacySeed?.world_meta.dominant_language ?? 'unknown',
          complexity_score: this.legacySeed?.world_meta.complexity_score ?? 0,
        },
      })
    }

    const cities = this.getCities()
    this.generator.generateCityLayout(cities)
    const worldBounds = this.generator.getWorldBounds()

    // Generate procedural background
    const background = new Graphics()

    // Base space/dark background
    background.rect(
      worldBounds.centerX - worldBounds.width / 2,
      worldBounds.centerY - worldBounds.height / 2,
      worldBounds.width,
      worldBounds.height
    ).fill(0x0a0a0a)

    // Add subtle grid for depth
    background.setStrokeStyle({ width: 1, color: 0x1a1a1a, alpha: 0.3 })
    const gridSize = 200
    const startX = worldBounds.centerX - worldBounds.width / 2
    const startY = worldBounds.centerY - worldBounds.height / 2

    for (let x = 0; x <= worldBounds.width; x += gridSize) {
      background.moveTo(startX + x, startY)
        .lineTo(startX + x, startY + worldBounds.height)
        .stroke()
    }
    for (let y = 0; y <= worldBounds.height; y += gridSize) {
      background.moveTo(startX, startY + y)
        .lineTo(startX + worldBounds.width, startY + y)
        .stroke()
    }

    this.camera.container.addChild(background)

    // Setup chunk manager
    this.chunkManager = new ChunkManager(this.camera.container, {
      chunkSize: 1000,
      loadRadius: 2,
      unloadRadius: 3,
    })
    this.chunkManager.setCities(cities, this.generator)

    // For small worlds, load everything immediately
    if (cities.length <= 10) {
      this.chunkManager.loadAll()
    }

    // Setup input
    this.input = new Input()

    // Setup player at spawn position
    const spawn = this.generator.getSpawnPosition()
    this.player = new Player(spawn.x, spawn.y)
    await this.player.load()
    this.camera.container.addChild(this.player.sprite)

    // Setup camera
    this.camera.follow(this.player.sprite)
    this.camera.snapToTarget()
  }

  update(dt: number) {
    if (!this.player || !this.input || this.transitioning) return

    this.player.update(dt, this.input)
    this.camera.update(dt)

    // Update chunk loading based on player position
    this.chunkManager?.update(this.player.sprite.x, this.player.sprite.y)

    // Check for city collisions
    const loadedSprites = this.chunkManager?.getLoadedCitySprites()
    if (loadedSprites) {
      for (const [_cityId, sprite] of loadedSprites) {
        if (this.intersects(this.player.sprite, sprite)) {
          const city = (sprite as any).__city as City
          if (!city) continue

          this.transitioning = true
          this.manager.switch(new CityScene(city, this.manager))
          return
        }
      }
    }
  }

  private intersects(a: Container, b: Container): boolean {
    const rectA: Rectangle = a.getBounds().rectangle
    const rectB: Rectangle = b.getBounds().rectangle
    return rectA.intersects(rectB)
  }

  unmount() {
    this.input?.destroy()
    this.player?.destroy()
    this.chunkManager?.destroy()

    this.input = undefined
    this.player = undefined
    this.chunkManager = undefined
    this.generator = undefined

    this.container.destroy({
      children: true,
      texture: false,
    })
    this.mounted = false
  }
}
