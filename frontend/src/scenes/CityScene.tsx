// CityScene.ts
import { Container, Text, Graphics, Rectangle } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { City, District, Building } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { Player } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createBuildingSprite } from '../sprites/Building'
import { SeededRandom } from '../engine/SeededRandom'
import { CityLayout } from '../engine/CityLayout'

export class CityScene implements Scene {
  container = new Container()
  private city: City
  private mounted = false

  private camera = new Camera()
  private player?: Player
  private input?: Input

  // [Robustness] Define exact world bounds
  private worldBounds = new Rectangle(0, 0, 2000, 2000)

  constructor(city: City, _manager: SceneManager) {
    this.city = city
  }

  async mount() {
    if (this.mounted) return
    this.mounted = true

    // --- 1. Setup Camera
    this.container.addChild(this.camera.container)

    // --- 2. Generate Procedural Background (1000x1000 or larger) ---
    // We use Graphics to draw a grid/ground directly
    const ground = new Graphics()

    // Draw base asphalt
    ground.rect(0, 0, this.worldBounds.width, this.worldBounds.height).fill(0x1a1a1a)

    // Draw subtle grid lines for "Cyberpunk/Sci-Fi" feel
    ground.setStrokeStyle({ width: 2, color: 0x333333, alpha: 0.5 })
    for (let i = 0; i <= this.worldBounds.width; i += 100) {
      ground.moveTo(i, 0).lineTo(i, this.worldBounds.height).stroke()
      ground.moveTo(0, i).lineTo(this.worldBounds.width, i).stroke()
    }

    // Optimisation: Convert Graphics to a Texture for better performance if static
    // (Optional, keeps draw calls low)
    this.camera.container.addChild(ground)

    // --- 3. Generate City Layout ---
    const rng = new SeededRandom(this.city.spec.name)
    const layoutSystem = new CityLayout(rng)

    // Generate organic districts
    // Use slightly less than full width to leave margins
    const districtNodes = layoutSystem.generateMap(
      this.getDistricts(),
      this.worldBounds.width - 200,
      this.worldBounds.height - 200
    )

    // --- 4. Render Districts & Buildings ---
    const cityContent = new Container()
    cityContent.position.set(100, 100) // Margin
    this.camera.container.addChild(cityContent)

    let spawnPoint = { x: 400, y: 300 }

    districtNodes.forEach((node, index) => {
      // District Floor
      const districtGfx = new Graphics()
      districtGfx
        .roundRect(node.bounds.x, node.bounds.y, node.bounds.width, node.bounds.height, 15)
        .fill({ color: node.color, alpha: 0.2 })
        .stroke({ width: 2, color: 0x444444, alpha: 0.8 })

      // District Label
      const label = new Text({
        text: node.data.spec.name,
        style: { fontFamily: 'Inter', fontSize: 16, fill: 0x888888 }
      })
      label.position.set(node.bounds.x + 20, node.bounds.y + 15)

      districtGfx.addChild(label)
      cityContent.addChild(districtGfx)

      // Buildings
      const buildings = this.getBuildings(node.data)
      // Pass the *relative* bounds to pack buildings inside this district
      // Note: Layout system returns relative bounds (x,y inside the split rect)
      const placements = layoutSystem.packBuildings(buildings, node.bounds)

      placements.forEach(item => {
        const bSprite = createBuildingSprite(item.building)
        // Add local bounds offset to global container
        bSprite.position.set(item.x, item.y)
        cityContent.addChild(bSprite)
      })

      // Set spawn point to center of first district
      if (index === 0) {
        spawnPoint = {
          x: node.bounds.x + node.bounds.width / 2 + 100,
          y: node.bounds.y + node.bounds.height / 2 + 100
        }
      }
    })

    // --- 5. Player Setup ---
    this.input = new Input()
    this.player = new Player(spawnPoint.x, spawnPoint.y)
    await this.player.load()
    this.camera.container.addChild(this.player.sprite)

    // Camera Setup
    this.camera.setBounds(this.worldBounds)
    this.camera.follow(this.player.sprite)
    this.camera.snapToTarget()
  }

  update(dt: number) {
    if (!this.player || !this.input) return
    this.player.update(dt, this.input)
    this.camera.update(dt)
  }

  unmount() {
    this.input?.destroy()
    this.player?.destroy()
    this.container.destroy({ children: true })
    this.mounted = false
  }

  // --- Helpers ---
  private getDistricts(): District[] {
    if (this.city.districts?.length) return this.city.districts
    return (this.city.spec as any).children?.filter((e: any) => e.kind === 'District') || []
  }

  private getBuildings(district: District): Building[] {
    if (district.buildings?.length) return district.buildings
    return (district.spec as any).children?.filter((e: any) => e.kind === 'Building') || []
  }
}