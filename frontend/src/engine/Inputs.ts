// engine/Input.ts
export class Input {
  private keys: Record<string, boolean> = {}
  private prevKeys: Record<string, boolean> = {}

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  }

  isDown(code: string) {
    return !!this.keys[code];
  }

  /** Returns true only on the frame the key was first pressed */
  isJustPressed(code: string) {
    return !!this.keys[code] && !this.prevKeys[code];
  }

  /** Call at end of update to track previous state */
  updatePrevious() {
    this.prevKeys = { ...this.keys };
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }
}
