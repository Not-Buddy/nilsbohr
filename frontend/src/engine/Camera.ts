import { Container } from 'pixi.js'
import type { Sprite } from 'pixi.js'

export class Camera {
  container: Container

  private target?: Sprite
  private lerp = 0.1

  constructor() {
    this.container = new Container()
  }

  follow(target: Sprite) {
    this.target = target
  }

  update(_dt: number) {
    if (!this.target) return

    const targetX = window.innerWidth / 2 - this.target.x
    const targetY = window.innerHeight / 2 - this.target.y

    this.container.x += (targetX - this.container.x) * this.lerp
    this.container.y += (targetY - this.container.y) * this.lerp
  }

  snapToTarget() {
    if (!this.target) return

    this.container.x = window.innerWidth / 2 - this.target.x
    this.container.y = window.innerHeight / 2 - this.target.y
  }

  /** Optional: zoom */
  setZoom(scale: number) {
    this.container.scale.set(scale)
  }

  /** Set world bounds for camera clamping (placeholder for future implementation) */
  setBounds(_bounds: { x: number; y: number; width: number; height: number }) {
    // TODO: Implement camera bounds clamping in update() method
  }
}
