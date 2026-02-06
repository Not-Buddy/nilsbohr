import { Container, Ticker } from 'pixi.js'
import type { Scene } from '../types/Types';

// engine/SceneManager.ts
export class SceneManager {
  private current?: Scene;
  private mounted = false;
  private stage: Container;

  constructor(stage: Container) {
    this.stage = stage;
    Ticker.shared.add(this.tick);
  }

  private tick = (ticker: Ticker) => {
    if (this.current && this.mounted) {
      this.current.update(ticker.deltaMS / 1000);
    }
  }

  async switch(scene: Scene) {
    if (this.current) {
      this.stage.removeChild(this.current.container);
      this.current.unmount();
    }

    this.mounted = false;
    this.current = scene;

    await scene.mount();

    this.stage.addChild(scene.container);
    this.mounted = true;
  }
}
