// WorldScene.ts
import { Container, Assets, Rectangle, Sprite } from 'pixi.js';
import { CityScene } from './CityScene';
import { createCitySprite } from '../sprites/City';
import { Player } from '../sprites/Player';
import { Input } from '../engine/Inputs';

import type { Scene } from '../types/Types';
import type { WorldSeed, City } from '../types/SeedTypes';

// import bun from '../assets/bun.jpg';
import worldBg from '../assets/world.png';

import type { SceneManager } from '../engine/SceneManager';
import { Camera } from '../engine/Camera'

export class WorldScene implements Scene {
  container = new Container();

  private seed: WorldSeed;
  private mounted = false;
  private transitioning = false // transitioning to a city that is
  private player?: Player;
  private input?: Input;
  private manager: SceneManager;
  private camera = new Camera();

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
    this.container.addChild(this.camera.container)
    const bgTexture = await Assets.load(worldBg)
    const background = new Sprite(bgTexture)

    background.anchor.set(0)
    background.x = 0
    background.y = 0

    // Optional: scale to world size
    background.width = 4000
    background.height = 2000

    // Add FIRST so it stays behind everything
    this.camera.container.addChild(background)

    //Drawing all cities one by one here
    for (let i = 0; i < this.seed.cities.length; i++) {
      const city: City = this.seed.cities[i];
      const sprite = createCitySprite(city);
      (sprite as any).__city = city


      // Temporary layout
      sprite.x = (i * 500) + 200;
      sprite.y = 150;

      this.camera.container.addChild(sprite);
    }

    this.input = new Input();

    // const playerTexture: Texture = await Assets.load(bun);

    this.player = new Player(
      window.innerWidth / 2,
      window.innerHeight / 2
    );
    await this.player.load();
    // player is added above the world map
    this.camera.container.addChild(this.player.sprite);
    this.camera.follow(this.player.sprite)
    this.camera.snapToTarget()

  }

  update(dt: number) {
    // update the scene every frame
    // only the player for now
    if (!this.player || !this.input || this.transitioning) return;
    this.player.update(dt, this.input);
    this.camera.update(dt);


    for (const child of this.camera.container.children) {
      if (child === this.player.sprite) continue

      if (this.intersects(this.player.sprite, child)) {
        const city = (child as any).__city as City;
        if (!city) continue;

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
