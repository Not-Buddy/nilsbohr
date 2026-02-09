// WorldScene.ts
// Updated to use dynamic world sizing based on project content

import { Container, Rectangle, Graphics, Text } from 'pixi.js'
import { CityScene } from './CityScene'
import { Player, type CollisionRect } from '../sprites/Player'
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
  private enterPrompt?: Container  // UI prompt for city entry

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

    // --- 3. Generate Procedural Background ---
    const background = new Graphics()

    // Base space/dark background covering the calculated world size
    background.rect(worldX, worldY, worldW, worldH).fill(0x0a0a0a)

    // Add subtle grid for depth
    background.setStrokeStyle({ width: 1, color: 0x1a1a1a, alpha: 0.3 })
    const gridSize = 200

    // Draw vertical lines
    for (let x = worldX; x <= worldX + worldW; x += gridSize) {
      background.moveTo(x, worldY).lineTo(x, worldY + worldH).stroke()
    }
    // Draw horizontal lines
    for (let y = worldY; y <= worldY + worldH; y += gridSize) {
      background.moveTo(worldX, y).lineTo(worldX + worldW, y).stroke()
    }

    this.camera.container.addChild(background)

    // --- 4. Setup Chunk Manager ---
    this.chunkManager = new ChunkManager(this.camera.container, {
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

    const spawn = this.generator.getSpawnPosition()
    this.player = new Player(spawn.x, spawn.y)
    await this.player.load()
    this.camera.container.addChild(this.player.sprite)

    // Setup camera with the new dynamic bounds
    this.camera.setBounds(new Rectangle(worldX, worldY, worldW, worldH))
    this.camera.follow(this.player.sprite)
    this.camera.snapToTarget()
  }

  update(dt: number) {
    if (!this.player || !this.input || this.transitioning) return

    this.player.update(dt, this.input)
    this.camera.update(dt)

    // Update chunk loading based on player position
    this.chunkManager?.update(this.player.sprite.x, this.player.sprite.y)

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
        this.manager.switch(new CityScene(foundNearbyCity, this.manager))
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
    this.input?.destroy()
    this.player?.destroy()
    this.chunkManager?.destroy()
    this.enterPrompt?.destroy()

    this.input = undefined
    this.player = undefined
    this.chunkManager = undefined
    this.generator = undefined
    this.enterPrompt = undefined // Nullify the reference after destroying

    this.container.destroy({
      children: true,
      texture: false,
    })
    this.mounted = false
  }
}