// WorldScene.ts
import { Container } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { WorldSeed, City } from '../types/SeedTypes'
import { createCitySprite } from '../sprites/City'

export class WorldScene implements Scene {
  private container = new Container()
  private seed: WorldSeed

  constructor(seed: WorldSeed) {
    this.seed = seed;
  }

  mount(root: Container) {
    root.addChild(this.container)

    this.seed.cities.forEach((city: City, index: number) => {
      const sprite = createCitySprite(city)

      // Temporary layout — grid / spiral later
      sprite.x = index * 900
      sprite.y = 0

      this.container.addChild(sprite)
    })
  }

  unmount() {
    this.container.destroy({
      children: true,
      texture: false,
    })
  }
}
