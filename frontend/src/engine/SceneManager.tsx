import { Container } from 'pixi.js'
import type { Scene } from '../types/Types';

export class SceneManager {
  private root: Container
  private current: Scene | null = null

  constructor(root: Container) {
    this.root = root
  }

  switch(scene: Scene) {
    if (this.current) {
      this.current.unmount()
      this.root.removeChildren()
    }

    this.current = scene
    scene.mount(this.root)
  }

  destroy() {
    this.current?.unmount()
    this.root.removeChildren()
  }
}
