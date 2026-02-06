// WorldScene.ts
import { Container, Texture, Assets } from 'pixi.js';
import type { Scene } from '../types/Types';
import type { WorldSeed, City } from '../types/SeedTypes';
import { createCitySprite } from '../sprites/City';
import { Player } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import bun from '../assets/bun.jpg'

export class WorldScene implements Scene {
  container = new Container();

  private seed: WorldSeed;
  private mounted = false;
  private player?: Player;
  private input?: Input;

  constructor(seed: WorldSeed) {
    this.seed = seed;
  }

  async mount() {
    if (this.mounted) return;
    this.mounted = true;
    //Drawing all citie sone by one here
    for (let i = 0; i < this.seed.cities.length; i++) {
      const city: City = this.seed.cities[i];
      const sprite = createCitySprite(city);

      // Temporary layout
      sprite.x = (i * 500) + 200;
      sprite.y = 400;

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
    if (!this.player || !this.input) return
    this.player.update(dt, this.input)

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
