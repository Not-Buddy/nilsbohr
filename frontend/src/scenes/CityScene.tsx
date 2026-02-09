// CityScene.ts
import { Container, Text, Graphics, Rectangle } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { City, District, Building } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { Player, type CollisionRect } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createBuildingSprite } from '../sprites/Building'
import { SeededRandom } from '../engine/SeededRandom'
import { CityGenerator } from '../engine/CityGenerator'
import { Minimap } from '../engine/Minimap'
import { BuildingScene } from './BuildingScene'

export class CityScene implements Scene {
  container = new Container()
  private city: City
  private mounted = false

  private camera = new Camera()
  private player?: Player
  private input?: Input

  // [Robustness] Default start, but will be overwritten dynamically
  private worldBounds = new Rectangle(0, 0, 10000, 10000)
  private minimap?: Minimap
  private districtNodes: { bounds: { x: number; y: number; width: number; height: number }; color: number }[] = []
  private buildingBounds: CollisionRect[] = []  // For collision detection (with buildingRef)
  private nearbyBuilding?: Building
  private enterPrompt?: Container
  private manager: SceneManager
  private spawnPosition?: { x: number; y: number }

  constructor(city: City, manager: SceneManager, spawnPosition?: { x: number; y: number }) {
    this.city = city
    this.manager = manager
    this.spawnPosition = spawnPosition
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

    // Heuristic for world size:
    // - Average building footprint: ~70x70 (with slight variance)
    // - Alley/gap space: ~15px per building
    // - District overhead: margins, labels, padding
    const avgBuildingFootprint = 70 * 70
    const gapPerBuilding = 15 * 15
    const districtOverhead = districts.length * 150 * 150  // margins + labels

    // For large repositories, increase the area allocation per building to prevent overcrowding
    const densityFactor = totalBuildings > 100 ? 2.0 : (totalBuildings > 50 ? 1.5 : 1.0) // Increased factors
    const buildingArea = totalBuildings * (avgBuildingFootprint + gapPerBuilding) * densityFactor + districtOverhead

    const minSide = 2000 // Increased minimum side
    const calculatedSide = Math.max(minSide, Math.sqrt(buildingArea + (2000 * 2000))) // Increased base area

    // Add 40% padding for margins (increased from 35% for large repos)
    const paddingFactor = totalBuildings > 100 ? 1.4 : (totalBuildings > 50 ? 1.35 : 1.3)
    const worldW = Math.ceil(calculatedSide * paddingFactor)
    const worldH = Math.ceil(calculatedSide * paddingFactor)

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

    // --- 4. Generate City Layout using CityGenerator for better district sizing ---
    const worldRng = new SeededRandom(this.city.spec.name);
    const cityGenerator = new CityGenerator(this.city, worldRng);

    // Generate the city layout with positions
    cityGenerator.generate('organic'); // Use organic layout for more natural distribution

    // Get the generated positions
    const districtPositions = cityGenerator.getAllDistrictPositions();
    const buildingPositions = cityGenerator.getAllBuildingPositions();

    // --- 5. Render Districts & Buildings ---
    const cityContent = new Container()
    // Position city content at (0,0) since CityGenerator positions are absolute
    this.camera.container.addChild(cityContent)

    // Determine spawn point from city generator
    const spawnPoint = cityGenerator.getSpawnPosition();
    const adjustedSpawn = {
      x: spawnPoint.x,
      y: spawnPoint.y
    };

    // Render districts
    this.districtNodes = this.getDistricts().map(district => {
      const pos = districtPositions.get(district.spec.id);
      if (!pos) return null;

      return {
        data: district,
        bounds: {
          x: pos.x - pos.width / 2,
          y: pos.y - pos.height / 2,
          width: pos.width,
          height: pos.height
        },
        color: this.getDistrictColor(district, this.getDistricts().indexOf(district))
      };
    }).filter(Boolean) as any[];

    this.districtNodes.forEach((node: any, index) => {
      if (!node) return;

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

      // Buildings - use the positions from CityGenerator
      const buildings = this.getBuildings(node.data)
      const placements = buildings.map(building => {
        const pos = buildingPositions.get(building.spec.id);
        if (!pos) return null;

        return {
          building,
          bounds: {
            x: pos.x - pos.width / 2,
            y: pos.y - pos.height / 2,
            width: pos.width,
            height: pos.height
          }
        };
      }).filter(Boolean);

      placements.forEach((item: any) => {
        if (!item) return;

        const bSprite = createBuildingSprite(item.building)

        // Position relative to cityContent - use the center position from CityGenerator
        bSprite.position.set(
          item.bounds.x + item.bounds.width / 2,
          item.bounds.y + item.bounds.height / 2
        )

        cityContent.addChild(bSprite)

        // Collect building bounds for collision (NOT enterable - must use J key)
        const boundsWithBuilding = {
          x: item.bounds.x,
          y: item.bounds.y,
          width: item.bounds.width,
          height: item.bounds.height,
          enterable: false,  // Buildings are solid - use J key to enter
          buildingRef: item.building  // Store reference for entry detection
        }
        this.buildingBounds.push(boundsWithBuilding as CollisionRect)
      })

      // Set spawn point to center of first district if not already set
      if (index === 0 && !this.player) {
        // Already handled via cityGenerator above
      }
    })

    // --- 6. Player Setup ---
    this.input = new Input()
    // Use provided spawn position (from exiting building) or default spawn
    const spawn = this.spawnPosition ?? adjustedSpawn
    this.player = new Player(spawn.x, spawn.y)
    await this.player.load()
    this.camera.container.addChild(this.player.sprite)

    // Camera Bounds Setup
    this.camera.setBounds(this.worldBounds)
    this.camera.follow(this.player.sprite)
    this.camera.snapToTarget()

    // --- 7. Minimap Setup ---
    this.minimap = new Minimap({
      worldBounds: this.worldBounds,
      size: 180,
      margin: 20,
    })
    this.minimap.setDistricts(this.districtNodes)
    this.minimap.positionOnScreen(window.innerWidth, window.innerHeight)
    this.container.addChild(this.minimap.container)

    // Set building collision bounds for player
    this.player.setCollisionBounds(this.buildingBounds)

    // Handle window resize for minimap positioning
    window.addEventListener('resize', this.handleResize)
  }

  private handleResize = (): void => {
    this.minimap?.positionOnScreen(window.innerWidth, window.innerHeight)
  }

  update(dt: number) {
    if (!this.player || !this.input) return
    this.player.update(dt, this.input)
    this.camera.update(dt)

    // Update minimap with player position
    if (this.minimap && this.player) {
      this.minimap.updatePlayerPosition(this.player.sprite.x, this.player.sprite.y)
    }

    // Check for nearby buildings (for entry)
    this.nearbyBuilding = undefined
    const playerX = this.player.sprite.x
    const playerY = this.player.sprite.y

    for (const bounds of this.buildingBounds) {
      const building = (bounds as any).buildingRef as Building | undefined
      if (!building) continue

      // Check if player is near bottom of building (entry zone)
      const nearBottom =
        playerX > bounds.x &&
        playerX < bounds.x + bounds.width &&
        playerY > bounds.y + bounds.height - 10 &&
        playerY < bounds.y + bounds.height + 50

      if (nearBottom) {
        this.nearbyBuilding = building
        break
      }
    }

    // Show/hide entry prompt
    if (this.nearbyBuilding) {
      this.showEnterPrompt()

      if (this.input.isJustPressed('KeyJ')) {
        const entryPos = { x: this.player.sprite.x, y: this.player.sprite.y }
        this.manager.switch(new BuildingScene(this.nearbyBuilding, this.city, this.manager, entryPos))
        return
      }
    } else {
      this.hideEnterPrompt()
    }

    this.input.updatePrevious()
  }

  private showEnterPrompt(): void {
    if (!this.enterPrompt) {
      this.enterPrompt = new Container()

      const bg = new Graphics()
      bg.roundRect(-120, -25, 240, 50, 10)
      bg.fill({ color: 0x000000, alpha: 0.8 })
      bg.stroke({ width: 2, color: 0x00ff00 })
      this.enterPrompt.addChild(bg)

      const text = new Text({
        text: 'Press J to Enter Building',
        style: {
          fontFamily: 'monospace',
          fontSize: 16,
          fill: 0x00ff00,
        }
      })
      text.anchor.set(0.5, 0.5)
      this.enterPrompt.addChild(text)

      this.container.addChild(this.enterPrompt)
    }

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

  unmount() {
    window.removeEventListener('resize', this.handleResize)
    this.input?.destroy()
    this.player?.destroy()
    this.minimap?.destroy()
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

  private getDistrictColor(_district: District, index: number): number {
    const colors = [
      0x3b82f6, 0x10b981, 0xf59e0b, 0xef4444,
      0x8b5cf6, 0xec4899, 0x14b8a6, 0xf97316,
    ]
    return colors[index % colors.length]
  }
}