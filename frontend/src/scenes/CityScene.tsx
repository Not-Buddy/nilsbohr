// CityScene.ts
import { Container, Assets, Sprite, Text } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { City, District, Building } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { Player } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createBuildingSprite } from '../sprites/Building'

import cityBg from '../assets/background.png'

export class CityScene implements Scene {
  container = new Container()

  private city: City
  private manager: SceneManager
  private mounted = false

  private camera = new Camera()
  private player?: Player
  private input?: Input

  constructor(city: City, manager: SceneManager) {
    this.city = city
    this.manager = manager
  }

  async mount() {
    if (this.mounted) return
    this.mounted = true

    // --- Camera root
    this.container.addChild(this.camera.container)

    // --- Background
    const bgTexture = await Assets.load(cityBg)
    const background = new Sprite(bgTexture)
    background.width = 3000
    background.height = 2000
    this.camera.container.addChild(background)

    // --- Title (world-space)
    const title = new Text({
      text: this.city.spec.name + " - Reload to go back",
      style: { fill: '#2a2a2aff', fontSize: 36 },
    })
    title.position.set(100, 40)
    this.camera.container.addChild(title)

    // --- City content root
    const cityContent = new Container()
    cityContent.position.set(100, 120)
    this.camera.container.addChild(cityContent)

    // --- Extract districts
    const districts = this.city.spec.children.filter(
      (e): e is District => e.kind === 'District'
    )

    // --- Layout constants
    const districtSpacingY = 220
    const buildingCols = 6
    const buildingSpacingX = 90
    const buildingSpacingY = 90

    // --- Draw buildings grouped by district
    districts.forEach((district, districtIndex) => {
      const districtContainer = new Container()
      districtContainer.y = districtIndex * districtSpacingY

      const buildings = district.spec.children.filter(
        (e): e is Building => e.kind === 'Building'
      )

      buildings.forEach((building, i) => {
        const sprite = createBuildingSprite(building)

        const col = i % buildingCols
        const row = Math.floor(i / buildingCols)

        sprite.x = col * buildingSpacingX
        sprite.y = row * buildingSpacingY

        districtContainer.addChild(sprite)
      })

      cityContent.addChild(districtContainer)
    })

    // --- Player
    this.input = new Input()
    this.player = new Player(400, 300)
    await this.player.load()
    this.camera.container.addChild(this.player.sprite)

    // --- Camera follow
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
    this.input = undefined
    this.player = undefined
    this.container.destroy({ children: true })
    this.mounted = false
  }
}