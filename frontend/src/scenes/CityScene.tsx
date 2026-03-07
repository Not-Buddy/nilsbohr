// CityScene.ts
import { Container, Text, Graphics, Rectangle } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { City, District, Building, Room, Artifact, WorldSeed, ProjectResponse } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { Player, type CollisionRect } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createBuildingSprite } from '../sprites/Building'
import { SeededRandom } from '../engine/SeededRandom'
import { CityGenerator } from '../engine/CityGenerator'
import { Minimap } from '../engine/Minimap'
import { BuildingScene } from './BuildingScene'
import { assignBiomes, type BiomePalette } from '../engine/CityGenerator/BiomeConfig'
import { renderCityGround } from '../engine/CityGenerator/CityGroundRenderer'
import { generateRoads, renderRoads } from '../engine/CityGenerator/RoadNetwork'

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
  private emptyPrompt?: Container
  private manager: SceneManager
  private spawnPosition?: { x: number; y: number }
  private worldSeed?: WorldSeed | ProjectResponse
  private worldEntryPosition?: { x: number; y: number }

  constructor(
    city: City,
    manager: SceneManager,
    spawnPosition?: { x: number; y: number },
    worldSeed?: WorldSeed | ProjectResponse,
    worldEntryPosition?: { x: number; y: number }
  ) {
    this.city = city
    this.manager = manager
    this.spawnPosition = spawnPosition
    this.worldSeed = worldSeed
    this.worldEntryPosition = worldEntryPosition
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

    // --- 3. Generate City Layout ---
    const worldRng = new SeededRandom(this.city.spec.name);
    const cityGenerator = new CityGenerator(this.city, worldRng);
    cityGenerator.generate('organic');

    const districtPositions = cityGenerator.getAllDistrictPositions();
    const buildingPositions = cityGenerator.getAllBuildingPositions();

    // --- 4. Assign Biomes to Districts ---
    const biomeMap = assignBiomes(districts, worldRng)

    // --- 5. Render Biome Ground ---
    const districtRenderInfos = districts.map((district, _index) => {
      const pos = districtPositions.get(district.spec.id)
      const biome = biomeMap.get(district.spec.id)
      if (!pos || !biome) return null
      return { id: district.spec.id, position: pos, biome }
    }).filter(Boolean) as { id: string; position: import('../engine/CityGenerator/types').DistrictPosition; biome: BiomePalette }[]

    const groundContainer = renderCityGround(districtRenderInfos, worldW, worldH)
    this.camera.container.addChild(groundContainer)

    // --- 6. Generate & Render Roads ---
    const roadSegments = generateRoads(
      districts,
      districtPositions,
      buildingPositions,
      (d) => this.getBuildings(d),
      worldRng.range(0, 999999)
    )
    const roadContainer = renderRoads(roadSegments)
    this.camera.container.addChild(roadContainer)

    // --- 7. Render Districts & Buildings ---
    const cityContent = new Container()
    this.camera.container.addChild(cityContent)

    // Determine spawn point
    const spawnPoint = cityGenerator.getSpawnPosition();
    const adjustedSpawn = { x: spawnPoint.x, y: spawnPoint.y };

    // Build district node data for minimap
    this.districtNodes = districts.map(district => {
      const pos = districtPositions.get(district.spec.id);
      const biome = biomeMap.get(district.spec.id)
      if (!pos) return null;

      return {
        data: district,
        bounds: {
          x: pos.x - pos.width / 2,
          y: pos.y - pos.height / 2,
          width: pos.width,
          height: pos.height
        },
        color: biome?.borderColor ?? 0x444444
      };
    }).filter(Boolean) as any[];

    // Render each district's border, label, and buildings
    this.districtNodes.forEach((node: any) => {
      if (!node) return;

      const biome = biomeMap.get(node.data.spec.id)

      // District border — uses biome color
      const districtGfx = new Graphics()
      districtGfx
        .roundRect(node.bounds.x, node.bounds.y, node.bounds.width, node.bounds.height, 15)
        .stroke({ width: 2, color: biome?.borderColor ?? 0x444444, alpha: biome?.borderAlpha ?? 0.5 })

      // District Label
      const label = new Text({
        text: `${biome?.name ?? ''} · ${node.data.spec.name}`,
        style: {
          fontFamily: 'Inter',
          fontSize: 14,
          fill: biome?.borderColor ?? 0x888888,
          fontWeight: 'bold',
          wordWrap: true,
          wordWrapWidth: Math.max(50, node.bounds.width - 40)
        }
      })
      label.position.set(node.bounds.x + 20, node.bounds.y + 15)

      if (node.bounds.width < 80 || node.bounds.height < 60) {
        label.visible = false
      }

      districtGfx.addChild(label)
      cityContent.addChild(districtGfx)

      // Buildings
      const buildings = this.getBuildings(node.data)
      const placements = buildings.map((building: Building) => {
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

        const rooms = getBuildingRooms(item.building)
        const directArtifacts = getBuildingDirectArtifacts(item.building)
        const isEmpty = rooms.length === 0 && directArtifacts.length === 0
        const bSprite = createBuildingSprite(item.building, isEmpty, biome)

        bSprite.position.set(
          item.bounds.x + item.bounds.width / 2,
          item.bounds.y + item.bounds.height / 2
        )

        cityContent.addChild(bSprite)

        const boundsWithBuilding = {
          x: item.bounds.x,
          y: item.bounds.y,
          width: item.bounds.width,
          height: item.bounds.height,
          enterable: false,
          buildingRef: item.building
        }
        this.buildingBounds.push(boundsWithBuilding as CollisionRect)
      })
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
    let nearbyIsEmpty = false
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
        const rooms = getBuildingRooms(building)
        const directArtifacts = getBuildingDirectArtifacts(building)
        if (rooms.length === 0 && directArtifacts.length === 0) {
          nearbyIsEmpty = true
        } else {
          this.nearbyBuilding = building
        }
        break
      }
    }

    // Show/hide entry prompt
    if (this.nearbyBuilding) {
      this.hideEmptyBuildingPrompt()
      this.showEnterPrompt()

      if (this.input.isJustPressed('KeyJ')) {
        const entryPos = { x: this.player.sprite.x, y: this.player.sprite.y }
        this.manager.switch(new BuildingScene(
          this.nearbyBuilding,
          this.city,
          this.manager,
          entryPos,
          undefined,
          this.worldSeed,
          this.worldEntryPosition
        ))
        return
      }
    } else if (nearbyIsEmpty) {
      this.hideEnterPrompt()
      this.showEmptyBuildingPrompt()
    } else {
      this.hideEnterPrompt()
      this.hideEmptyBuildingPrompt()
    }

    // ESC to return to world
    if (this.input.isJustPressed('Escape') && this.worldSeed && this.worldEntryPosition) {
      // Lazy import to avoid circular dependency (WorldScene imports CityScene)
      import('./WorldScene').then(({ WorldScene }) => {
        this.manager.switch(new WorldScene(this.worldSeed!, this.manager, this.worldEntryPosition))
      })
      return
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

    const isMobile = window.innerWidth < 600
    this.enterPrompt.scale.set(isMobile ? 0.6 : 1)
    
    this.enterPrompt.position.set(
      window.innerWidth / 2,
      isMobile ? window.innerHeight - 200 : window.innerHeight - 80
    )
    this.enterPrompt.visible = true
  }

  private hideEnterPrompt(): void {
    if (this.enterPrompt) {
      this.enterPrompt.visible = false
    }
  }

  private showEmptyBuildingPrompt(): void {
    if (!this.emptyPrompt) {
      this.emptyPrompt = new Container()

      const bg = new Graphics()
      bg.roundRect(-150, -25, 300, 50, 10)
      bg.fill({ color: 0x000000, alpha: 0.8 })
      bg.stroke({ width: 2, color: 0xef4444 })
      this.emptyPrompt.addChild(bg)

      const text = new Text({
        text: '⚠ Empty building — cannot enter',
        style: {
          fontFamily: 'monospace',
          fontSize: 14,
          fill: 0xef4444,
        }
      })
      text.anchor.set(0.5, 0.5)
      this.emptyPrompt.addChild(text)

      this.container.addChild(this.emptyPrompt)
    }

    const isMobile = window.innerWidth < 600
    this.emptyPrompt.scale.set(isMobile ? 0.6 : 1)
    
    this.emptyPrompt.position.set(
      window.innerWidth / 2,
      isMobile ? window.innerHeight - 200 : window.innerHeight - 80
    )
    this.emptyPrompt.visible = true
  }

  private hideEmptyBuildingPrompt(): void {
    if (this.emptyPrompt) {
      this.emptyPrompt.visible = false
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
    const districts: District[] = []
    const traverse = (entities: any[]) => {
      for (const e of entities) {
        if (e.kind === 'District') {
          districts.push(e)
          if (e.spec.children) traverse(e.spec.children)
        }
      }
    }
    if ((this.city.spec as any).children) traverse((this.city.spec as any).children)
    return districts
  }

  private getBuildings(district: District): Building[] {
    // Only direct children buildings for rendering in this district
    return (district.spec as any).children?.filter((e: any) => e.kind === 'Building') || []
  }

  // getDistrictColor is no longer needed — biome palettes provide colors
}

// --- Building content helpers ---

function getBuildingRooms(building: Building): Room[] {
  const spec = building.spec as any
  if (spec.children && Array.isArray(spec.children)) {
    return spec.children.filter((e: any) => e.kind === 'Room')
  }
  return []
}

function getBuildingDirectArtifacts(building: Building): Artifact[] {
  const spec = building.spec as any
  if (spec.children && Array.isArray(spec.children)) {
    return spec.children.filter((e: any) => e.kind === 'Artifact')
  }
  return []
}