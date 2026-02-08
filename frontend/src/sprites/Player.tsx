// entities/Player.ts
import { Sprite, Texture } from 'pixi.js';
import type { Input } from '../engine/Inputs';

const MOVE_SPEED = 300; // pixels per second

export class Player {
  sprite: Sprite;

  constructor(texture: Texture, x: number, y: number) {
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.2);
    this.sprite.position.set(x, y);
  }

  update(dt: number, input: Input) {
    let dx = 0;
    let dy = 0;

    if (input.isDown('KeyA')) dx -= 1;
    if (input.isDown('KeyD')) dx += 1;
    if (input.isDown('KeyW')) dy -= 1;
    if (input.isDown('KeyS')) dy += 1;

    this.sprite.x += dx * MOVE_SPEED * dt
    this.sprite.y += dy * MOVE_SPEED * dt

    // this.clampToScreen()
  }

  destroy() {
    this.sprite.destroy()
  }
}
