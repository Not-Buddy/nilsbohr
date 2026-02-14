// WorldScene.ts
// Updated to use dynamic world sizing based on project content

import { Container, Rectangle, Graphics, Text } from 'pixi.js'
import { CityScene } from './CityScene'
import { Player, type CollisionRect } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { WorldGenerator } from '../engine/WorldGenerator'
import { ChunkManager } from '../engine/ChunkManager'
import { WorldMiniMap } from '../engine/WorldMiniMap'
import { GroundTiles } from '../engine/GroundGraphics/GroundTiles'
import { GroundChunkManager } from '../engine/GroundGraphics/GroundChunkManager'


import type { Scene } from '../types/Types'
import type { City, ProjectResponse, WorldSeed } from '../types/SeedTypes'
import type { SceneManager } from '../engine/SceneManager'
import GroundMap from '../assets/WorldAssets/Environ/overworld_floor.png'

console.log(GroundMap);


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
  private groundChunkManager?: GroundChunkManager
  private enterPrompt?: Container  // UI prompt for city entry
  private minimap?: WorldMiniMap
  private ground?: GroundTiles
  private spawnPosition?: { x: number; y: number }

  // Support both old WorldSeed and new ProjectResponse formats
  private projectResponse?: ProjectResponse
  private legacySeed?: WorldSeed

  private groundLayer = new Container()
  private cityLayer = new Container()
  private entityLayer = new Container()


  constructor(seed: WorldSeed | ProjectResponse, manager: SceneManager, spawnPosition?: { x: number; y: number }) {
    this.manager = manager
    this.spawnPosition = spawnPosition

    // Detect seed format
    if ('project' in seed) {
      this.projectResponse = seed
    } else {
      this.legacySeed = seed
    }
  }

  /** Get the original seed to pass to child scenes */
  private getSeed(): WorldSeed | ProjectResponse {
    return (this.projectResponse ?? this.legacySeed)!
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
    this.camera.container.addChild(this.groundLayer)
    this.camera.container.addChild(this.cityLayer)
    this.camera.container.addChild(this.entityLayer)

    // --- 1. Setup World Generator ---
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

    // --- 2. Generate Layout & Calculate Dynamic Bounds ---
    const cities = this.getCities()
    this.generator.generateCityLayout(cities)

    // Get the "Tight" bounds (just the area covered by cities)
    const layoutBounds = this.generator.getWorldBounds()

    // Add dynamic padding based on world size
    // Small world = 2000px padding, Large world = 50% extra space
    const padding = Math.max(2000, Math.max(layoutBounds.width, layoutBounds.height) * 0.5)

    // Calculate top-left corner from center-based coordinates
    const layoutX = layoutBounds.centerX - layoutBounds.width / 2
    const layoutY = layoutBounds.centerY - layoutBounds.height / 2

    const worldX = layoutX - padding
    const worldY = layoutY - padding
    const worldW = layoutBounds.width + (padding * 2)
    const worldH = layoutBounds.height + (padding * 2)


    // --- 4. Setup Chunk Manager ---
    this.chunkManager = new ChunkManager(this.cityLayer, {
      chunkSize: 1000,
      loadRadius: 2, // Load 2 chunks out from player
      unloadRadius: 3,
    })
    this.chunkManager.setCities(cities, this.generator)

    // Optimization: For small worlds, just load everything to prevent pop-in
    if (cities.length <= 15) {
      this.chunkManager.loadAll()
    }

    // --- 5. Player & Camera ---
    this.input = new Input()

    const spawn = this.spawnPosition ?? this.generator.getSpawnPosition()
    this.player = new Player(spawn.x, spawn.y)
    await this.player.load()
    this.entityLayer.addChild(this.player.sprite)

    // Setup camera with the new dynamic bounds
    this.camera.setBounds(new Rectangle(worldX, worldY, worldW, worldH))
    this.camera.follow(this.player.sprite)
    this.camera.snapToTarget()

    // The World Background Texture
    this.ground = new GroundTiles({
      worldX,
      worldY,
      worldWidth: worldW,
      worldHeight: worldH,
      tileSize: 16,
      tilesetPath: GroundMap
    })

    await this.ground.load()
    this.groundChunkManager = new GroundChunkManager(
      this.groundLayer,
      512,              // chunkSize
      16,               // tileSize
      2,                // load radius
      (x, y) => this.ground!.getBaseTexture(x, y),
      (x, y) => this.ground!.getTileForPosition(x, y)
    )
    // --- 6. World Minimap ---
    const worldRect = new Rectangle(worldX, worldY, worldW, worldH)
    this.minimap = new WorldMiniMap({
      worldBounds: worldRect,
      size: 200,
      margin: 20,
    })

    // Get city positions from generator and pass to minimap
    const cityPositions = this.generator.getAllCityPositions()
    this.minimap.setCities(cities, cityPositions)
    this.minimap.positionOnScreen(window.innerWidth, window.innerHeight)
    this.container.addChild(this.minimap.container)

    // Handle window resize for minimap
    window.addEventListener('resize', this.handleResize)
  }

  private handleResize = (): void => {
    this.minimap?.positionOnScreen(window.innerWidth, window.innerHeight)
  }

  update(dt: number) {
    if (!this.player || !this.input || this.transitioning) return

    this.camera.update(dt)
    
    // Update chunk loading based on player position
    this.chunkManager?.update(this.player.sprite.x, this.player.sprite.y)
    this.groundChunkManager?.update(this.player.sprite.x, this.player.sprite.y)
    this.player.update(dt, this.input)


    // Update minimap player position
    this.minimap?.updatePlayerPosition(this.player.sprite.x, this.player.sprite.y)

    // Build collision bounds from loaded city sprites
    const collisionBounds: CollisionRect[] = []
    const loadedSprites = this.chunkManager?.getLoadedCitySprites()
    if (loadedSprites) {
      for (const [_cityId, sprite] of loadedSprites) {
        const bounds = sprite.getBounds()
        collisionBounds.push({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          enterable: true  // Cities can be entered from below
        })
      }
    }
    this.player.setCollisionBounds(collisionBounds)

    // Check for city proximity (for enter prompt)
    let foundNearbyCity: City | null = null
    // Reuse loadedSprites from collision check above
    if (loadedSprites) {
      for (const [_cityId, sprite] of loadedSprites) {
        if (this.intersects(this.player.sprite, sprite)) {
          const city = (sprite as any).__city as City
          if (!city) continue

          foundNearbyCity = city
          break
        }
      }
    }

    // Update nearby city state and prompt visibility
    if (foundNearbyCity) {
      this.showEnterPrompt()

      // Check if J was just pressed to enter
      if (this.input.isJustPressed('KeyJ')) {
        this.transitioning = true
        const worldEntryPos = { x: this.player!.sprite.x, y: this.player!.sprite.y }
        this.manager.switch(new CityScene(foundNearbyCity, this.manager, undefined, this.getSeed(), worldEntryPos))
        return
      }
    } else {
      this.hideEnterPrompt()
    }

    // Update previous key state for just-pressed detection
    this.input.updatePrevious()
  }

  private showEnterPrompt(): void {
    if (!this.enterPrompt) {
      this.enterPrompt = new Container()

      // Background
      const bg = new Graphics()
      bg.roundRect(-100, -25, 200, 50, 10)
      bg.fill({ color: 0x000000, alpha: 0.8 })
      bg.stroke({ width: 2, color: 0x00ff00 })
      this.enterPrompt.addChild(bg)

      // Text
      const text = new Text({
        text: 'Press J to Enter City',
        style: {
          fontFamily: 'monospace',
          fontSize: 16,
          fill: 0x00ff00,
        }
      })
      text.anchor.set(0.5, 0.5)
      this.enterPrompt.addChild(text)

      // Position at bottom center of screen (will be in UI layer)
      this.container.addChild(this.enterPrompt)
    }

    // Position prompt at bottom center
    this.enterPrompt.position.set(
      window.innerWidth / 2,
      window.innerHeight - 80
    )
    this.enterPrompt.visible = true
  }

  private hideEnterPrompt(): void {
    if (this.enterPrompt) {
      this.enterPrompt.visible = false
    }
  }

  private intersects(a: Container, b: Container): boolean {
    const rectA: Rectangle = a.getBounds().rectangle
    const rectB: Rectangle = b.getBounds().rectangle
    return rectA.intersects(rectB)
  }

  unmount() {
    window.removeEventListener('resize', this.handleResize)
    this.input?.destroy()
    this.player?.destroy()
    this.chunkManager?.destroy()
    this.enterPrompt?.destroy()
    this.minimap?.destroy()

    this.input = undefined
    this.player = undefined
    this.chunkManager = undefined
    this.generator = undefined
    this.enterPrompt = undefined
    this.minimap = undefined

    this.container.destroy({
      children: true,
      texture: false,
    })
    this.mounted = false
  }
}