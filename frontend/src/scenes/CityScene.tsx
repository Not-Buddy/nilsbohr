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

  // [Robustness] Default start, but will be overwritten dynamically
  private worldBounds = new Rectangle(0, 0, 2000, 2000)

  constructor(city: City, _manager: SceneManager) {
    this.city = city
  }

  async mount() {
    if (this.mounted) return
    this.mounted = true

    // --- 1. Calculate Dynamic World Size ---
    const districts = this.getDistricts()

    // Estimate needed area: Base size + (Buildings * AverageBuildingSize)
    // We sum up the total number of buildings across all districts
    let totalBuildings = 0
    districts.forEach(d => {
      totalBuildings += this.getBuildings(d).length
    })

    // Heuristic: 
    // - Base city size: 1000x1000
    // - Each building adds ~150x150 pixels of area (including roads)
    // - We want a square-ish map, so we take the sqrt of total area
    const buildingArea = totalBuildings * (150 * 150)
    const minSide = 1500
    const calculatedSide = Math.max(minSide, Math.sqrt(buildingArea + (1000 * 1000)))

    // Add 20% padding for margins
    const worldW = Math.ceil(calculatedSide * 1.2)
    const worldH = Math.ceil(calculatedSide * 1.2)

    // Update the world bounds
    this.worldBounds = new Rectangle(0, 0, worldW, worldH)

    console.log(`CityScene: Dynamic size set to ${worldW}x${worldH} for ${totalBuildings} buildings.`)

    // --- 2. Setup Camera ---
    this.container.addChild(this.camera.container)

    // --- 3. Generate Procedural Background ---
    const ground = new Graphics()

    // Draw base asphalt
    ground.rect(0, 0, this.worldBounds.width, this.worldBounds.height).fill(0x1a1a1a)

    // Draw grid lines (Cyberpunk style)
    ground.setStrokeStyle({ width: 2, color: 0x333333, alpha: 0.5 })

    // Optimization: Draw grid only within bounds
    const gridSize = 100
    for (let i = 0; i <= this.worldBounds.width; i += gridSize) {
      ground.moveTo(i, 0).lineTo(i, this.worldBounds.height).stroke()
    }
    for (let i = 0; i <= this.worldBounds.height; i += gridSize) {
      ground.moveTo(0, i).lineTo(this.worldBounds.width, i).stroke()
    }

    this.camera.container.addChild(ground)

    // --- 4. Generate City Layout ---
    const rng = new SeededRandom(this.city.spec.name)
    const layoutSystem = new CityLayout(rng)

    // Generate districts using the dynamic size (minus padding)
    const margin = 100
    const districtNodes = layoutSystem.generateMap(
      districts,
      this.worldBounds.width - (margin * 2),
      this.worldBounds.height - (margin * 2)
    )

    // --- 5. Render Districts & Buildings ---
    const cityContent = new Container()
    cityContent.position.set(margin, margin) // Offset by margin
    this.camera.container.addChild(cityContent)

    let spawnPoint = { x: worldW / 2, y: worldH / 2 } // Fallback spawn center

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
        style: {
          fontFamily: 'Inter',
          fontSize: 16,
          fill: 0x888888,
          wordWrap: true,
          wordWrapWidth: Math.max(50, node.bounds.width - 40)
        }
      })
      label.position.set(node.bounds.x + 20, node.bounds.y + 15)

      // Hide label if district is too small to display it properly
      if (node.bounds.width < 80 || node.bounds.height < 60) {
        label.visible = false
      }

      districtGfx.addChild(label)
      cityContent.addChild(districtGfx)

      // Buildings
      const buildings = this.getBuildings(node.data)
      const placements = layoutSystem.packBuildings(buildings, node.bounds)

      placements.forEach(item => {
        const bSprite = createBuildingSprite(item.building)

        // Position relative to cityContent
        // item.bounds is relative to the district node, which is relative to the split...
        // Wait! The layout system returns bounds relative to the Root Rect passed in.
        // Since we passed (0,0, w, h) to generateMap, the bounds are correct relative to cityContent.

        bSprite.position.set(
          item.bounds.x + item.bounds.width / 2,
          item.bounds.y + item.bounds.height / 2
        )

        cityContent.addChild(bSprite)
      })

      // Set spawn point to center of first district
      if (index === 0) {
        spawnPoint = {
          x: margin + node.bounds.x + node.bounds.width / 2,
          y: margin + node.bounds.y + node.bounds.height / 2
        }
      }
    })

    // --- 6. Player Setup ---
    this.input = new Input()
    // Spawn player safely
    this.player = new Player(spawnPoint.x, spawnPoint.y)
    await this.player.load()
    this.camera.container.addChild(this.player.sprite)

    // Camera Bounds Setup
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