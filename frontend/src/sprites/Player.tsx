// sprites/Player.tsx
import {
  AnimatedSprite,
  Spritesheet,
  Texture,
  Assets,
} from 'pixi.js'
import type { Input } from '../engine/Inputs'

// ---- SPRITESHEET IMPORTS ----
import walkUpPng from '../assets/SpriteMovement/Walking Up/Walking Up.png'
import walkUpJson from '../assets/SpriteMovement/Walking Up/Walking Up.json'
import walkDownPng from '../assets/SpriteMovement/Walking Down/Walking Down.png'
import walkDownJson from '../assets/SpriteMovement/Walking Down/Walking Down.json'
import walkLeftPng from '../assets/SpriteMovement/Walking Left/Walking Left.png'
import walkLeftJson from '../assets/SpriteMovement/Walking Left/Walking Left.json'
import walkRightPng from '../assets/SpriteMovement/Walking Right/Walking Right.png'
import walkRightJson from '../assets/SpriteMovement/Walking Right/Walking Right.json'

// ---- CONSTANTS ----
const MOVE_SPEED = 400
const ANIMATION_SPEED = 0.15
const SPRITE_SCALE = 0.5

type Direction = 'up' | 'down' | 'left' | 'right'
type AnimationState = 'idle' | 'walking'

export interface CollisionRect {
  x: number
  y: number
  width: number
  height: number
  enterable?: boolean  // True if player can enter from below (e.g., cities)
}

export class Player {
  sprite!: AnimatedSprite
  private animations: Record<Direction, Texture[]> = {} as any
  private direction: Direction = 'down'
  private isMoving: boolean = false
  private currentState: AnimationState = 'idle'
  private velocity = { x: 0, y: 0 }
  private keysPressed: Set<string> = new Set()
  private x: number;
  private y: number;

  // Collision detection
  private collisionBounds: CollisionRect[] = []
  private playerRadius = 20  // Collision radius for the player

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** Set solid collision bounds that the player cannot walk through */
  setCollisionBounds(bounds: CollisionRect[]): void {
    this.collisionBounds = bounds
  }

  // ---- LOAD ALL SPRITESHEETS ----
  async load() {
    try {
      this.animations.up = await this.loadSheet(walkUpPng, walkUpJson)
      this.animations.down = await this.loadSheet(walkDownPng, walkDownJson)
      this.animations.left = await this.loadSheet(walkLeftPng, walkLeftJson)
      this.animations.right = await this.loadSheet(walkRightPng, walkRightJson)

      if (!this.animations.down || this.animations.down.length === 0) {
        throw new Error('Failed to load down animation frames')
      }

      // ✅ Create AnimatedSprite ONLY after frames exist
      this.sprite = new AnimatedSprite(this.animations.down)
      this.sprite.anchor.set(0.5)
      this.sprite.scale.set(SPRITE_SCALE)
      this.sprite.position.set(this.x, this.y)
      this.sprite.animationSpeed = ANIMATION_SPEED
      this.sprite.gotoAndStop(0) // Start at idle frame
    } catch (error) {
      console.error('Failed to load player spritesheets:', error)
      throw error
    }
  }

  // ---- SPRITESHEET PARSER (Piskel-compatible) ----
  private async loadSheet(pngUrl: string, json: any): Promise<Texture[]> {
    try {
      const baseTexture = await Assets.load(pngUrl)
      const sheet = new Spritesheet(baseTexture, json)
      await sheet.parse()

      const frameNames = Object.keys(sheet.textures)
      if (frameNames.length === 0) {
        console.error('Spritesheet JSON:', json)
        throw new Error('Spritesheet parsed but contains no frames')
      }

      // Sort frames numerically (frame_0, frame_1, etc.)
      frameNames.sort((a, b) => {
        const na = Number(a.match(/\d+/)?.[0]) || 0
        const nb = Number(b.match(/\d+/)?.[0]) || 0
        return na - nb
      })

      return frameNames.map((name) => sheet.textures[name])
    } catch (error) {
      console.error(`Failed to load spritesheet ${pngUrl}:`, error)
      throw error
    }
  }

  // ---- CHANGE DIRECTION ----
  private setDirection(dir: Direction) {
    if (this.direction === dir) return

    this.direction = dir
    this.sprite.textures = this.animations[dir]

    // Resume walking if moving, or stay on idle frame
    if (this.isMoving) {
      this.sprite.play()
    } else {
      this.sprite.gotoAndStop(0)
    }
  }

  // ---- CHANGE ANIMATION STATE ----
  private setState(newState: AnimationState) {
    if (this.currentState === newState) return

    this.currentState = newState

    if (newState === 'walking') {
      this.sprite.play()
    } else {
      // idle - show first frame
      this.sprite.gotoAndStop(0)
    }
  }

  // ---- UPDATE LOOP ----
  update(dt: number, input: Input) {
    let dx = 0
    let dy = 0

    // Track which keys are currently pressed
    const keyMap: Record<string, Direction> = {
      KeyA: 'left',
      KeyD: 'right',
      KeyW: 'up',
      KeyS: 'down',
    }

    this.keysPressed.clear()

    // Check all movement keys
    for (const [key, _dir] of Object.entries(keyMap)) {
      if (input.isDown(key)) {
        this.keysPressed.add(key)
        if (key === 'KeyA') dx -= 1
        if (key === 'KeyD') dx += 1
        if (key === 'KeyW') dy -= 1
        if (key === 'KeyS') dy += 1
      }
    }

    // Determine animation direction: use last pressed key direction
    // This prevents flickering when holding multiple keys
    if (this.keysPressed.size > 0) {
      let lastDir: Direction = this.direction

      // Priority: WASD keys are pressed in order, last one wins for animation
      if (this.keysPressed.has('KeyW')) lastDir = 'up'
      if (this.keysPressed.has('KeyS')) lastDir = 'down'
      if (this.keysPressed.has('KeyA')) lastDir = 'left'
      if (this.keysPressed.has('KeyD')) lastDir = 'right'

      this.setDirection(lastDir)
    }

    // Normalize diagonal movement (for physics, not animation)
    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy)
      dx /= len
      dy /= len
    }

    // Update moving state
    const wasMoving = this.isMoving
    this.isMoving = dx !== 0 || dy !== 0

    // Change animation state if needed
    if (wasMoving !== this.isMoving) {
      this.setState(this.isMoving ? 'walking' : 'idle')
    }

    // Store velocity for smooth movement
    this.velocity.x = dx * MOVE_SPEED
    this.velocity.y = dy * MOVE_SPEED

    // Calculate new position
    const newX = this.sprite.x + this.velocity.x * dt
    const newY = this.sprite.y + this.velocity.y * dt

    // Check X movement collision
    if (!this.checkCollision(newX, this.sprite.y)) {
      this.sprite.x = newX
    }

    // Check Y movement collision
    if (!this.checkCollision(this.sprite.x, newY)) {
      this.sprite.y = newY
    }
  }

  /** Check if position would collide with any solid bounds */
  private checkCollision(x: number, y: number): boolean {
    const r = this.playerRadius

    for (const rect of this.collisionBounds) {
      // Player bounding box at new position
      const playerLeft = x - r
      const playerRight = x + r
      const playerTop = y - r
      const playerBottom = y + r

      // Collision rect bounds
      const rectLeft = rect.x
      const rectRight = rect.x + rect.width
      const rectTop = rect.y
      const rectBottom = rect.y + rect.height

      // Check AABB intersection at proposed position
      const collides =
        playerRight > rectLeft &&
        playerLeft < rectRight &&
        playerBottom > rectTop &&
        playerTop < rectBottom

      if (!collides) continue

      // If enterable (like cities), allow entry from below
      if (rect.enterable) {
        const approachingFromBelow = this.sprite.y > rectBottom - r
        if (approachingFromBelow) {
          continue  // Don't block - allow entry
        }
      }

      // ESCAPE FIX: Check if player is ALREADY overlapping at current position.
      // If so, only block movement that pushes DEEPER into the rect.
      // This prevents the player from getting permanently stuck.
      const curLeft = this.sprite.x - r
      const curRight = this.sprite.x + r
      const curTop = this.sprite.y - r
      const curBottom = this.sprite.y + r

      const alreadyOverlapping =
        curRight > rectLeft &&
        curLeft < rectRight &&
        curBottom > rectTop &&
        curTop < rectBottom

      if (alreadyOverlapping) {
        // Calculate overlap depth at current vs proposed position
        // Allow the move if it reduces overlap (moving away from the rect)
        const curOverlapX = Math.min(curRight - rectLeft, rectRight - curLeft)
        const curOverlapY = Math.min(curBottom - rectTop, rectBottom - curTop)
        const newOverlapX = Math.min(playerRight - rectLeft, rectRight - playerLeft)
        const newOverlapY = Math.min(playerBottom - rectTop, rectBottom - playerTop)

        const curOverlap = Math.min(curOverlapX, curOverlapY)
        const newOverlap = Math.min(newOverlapX, newOverlapY)

        if (newOverlap <= curOverlap) {
          continue  // Moving away or same — allow escape
        }
      }

      return true  // Collision detected, block movement
    }
    return false
  }

  // ---- GETTERS ----
  getPosition() {
    return {
      x: this.sprite.x,
      y: this.sprite.y,
    }
  }

  getDirection(): Direction {
    return this.direction
  }

  isWalking(): boolean {
    return this.isMoving
  }

  // ---- CLEANUP ----
  destroy() {
    if (this.sprite) {
      this.sprite.stop()
      this.sprite.destroy()
    }
  }
}