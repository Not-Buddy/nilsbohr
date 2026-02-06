// WorldScene.ts
import { Container, Texture, Assets, Rectangle } from 'pixi.js';
import type { Scene } from '../types/Types';
import type { WorldSeed, City } from '../types/SeedTypes';
import { CityScene } from './CityScene';
import { createCitySprite } from '../sprites/City';
import { Player } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import bun from '../assets/bun.jpg'
import type { SceneManager } from '../engine/SceneManager';

export class WorldScene implements Scene {
  container = new Container();

  private seed: WorldSeed;
  private mounted = false;
  private transitioning = false // transitioning to a city that is
  private player?: Player;
  private input?: Input;
  private manager: SceneManager

  constructor(seed: WorldSeed, manager: SceneManager) {
    this.seed = seed;
    this.manager = manager;
  }

  // helper to check if player collides with a city
  private intersects(a: Container, b: Container) {
    const rectA: Rectangle = a.getBounds().rectangle;
    const rectB: Rectangle = b.getBounds().rectangle;
    return rectA.intersects(rectB)
  }

  async mount() {
    if (this.mounted) return;
    this.mounted = true;
    //Drawing all cities one by one here
    for (let i = 0; i < this.seed.cities.length; i++) {
      const city: City = this.seed.cities[i];
      const sprite = createCitySprite(city);
      (sprite as any).__city = city


      // Temporary layout
      sprite.x = (i * 500) + 200;
      sprite.y = 150;

      this.container.addChild(sprite);
    }

    this.input = new Input();

    const texture: Texture = await Assets.load(bun);

    this.player = new Player(
      texture,
      window.innerWidth / 2,
      window.innerHeight / 2
    );

    // player is added above the world map
    this.container.addChild(this.player.sprite);

  }

  update(dt: number) {
    // update the scene every fram
    // only the player for now
    if (!this.player || !this.input || this.transitioning) return
    this.player.update(dt, this.input)

      for (const child of this.container.children) {
        if (child === this.player.sprite) continue

        if (this.intersects(this.player.sprite, child)) {
          const city = (child as any).__city as City;
          if(!city) continue;

          this.transitioning = true;
          this.manager.switch(new CityScene(city, this.manager));
          return;
        }
      }
  }

  unmount() {
    this.input?.destroy()
    this.player?.destroy()

    this.input = undefined
    this.player = undefined

    this.container.destroy({
      children: true,
      texture: false,
    })
    this.mounted = false
  }
}
