  // engine/Input.ts
  export class Input {
    private keys: Record<string, boolean> = {}

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

    destroy() {
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('keyup', this.onKeyUp)
    }
  }
