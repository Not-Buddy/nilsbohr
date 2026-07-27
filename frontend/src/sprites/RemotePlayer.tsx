import {
  AnimatedSprite,
  Spritesheet,
  Texture,
  Assets,
  Container,
  Graphics,
  Text,
} from 'pixi.js'
import type { PartyMember } from '../types/PartyTypes'

import walkUpPng from '../assets/SpriteMovement/Walking Up/Walking Up.png'
import walkUpJson from '../assets/SpriteMovement/Walking Up/Walking Up.json'
import walkDownPng from '../assets/SpriteMovement/Walking Down/Walking Down.png'
import walkDownJson from '../assets/SpriteMovement/Walking Down/Walking Down.json'
import walkLeftPng from '../assets/SpriteMovement/Walking Left/Walking Left.png'
import walkLeftJson from '../assets/SpriteMovement/Walking Left/Walking Left.json'
import walkRightPng from '../assets/SpriteMovement/Walking Right/Walking Right.png'
import walkRightJson from '../assets/SpriteMovement/Walking Right/Walking Right.json'

type Direction = 'up' | 'down' | 'left' | 'right'

const SPRITE_SCALE = 0.5
const ANIMATION_SPEED = 0.15
const LERP_FACTOR = 0.15

const TINTS = [
  0x6b8cff,  // blue
  0x9b59b6,  // purple
  0xe74c3c,  // red
  0x2ecc71,  // green
  0xf39c12,  // orange
  0x1abc9c,  // teal
  0xe84393,  // pink
  0x5f6caf,  // indigo
]

let sharedAnimations: Record<Direction, Texture[]> | null = null
let textureLoadPromise: Promise<Record<Direction, Texture[]>> | null = null

async function loadSharedAnimations(): Promise<Record<Direction, Texture[]>> {
  if (sharedAnimations) return sharedAnimations
  if (textureLoadPromise) return textureLoadPromise

  textureLoadPromise = (async () => {
    const loadSheet = async (pngUrl: string, json: any): Promise<Texture[]> => {
      const baseTexture = await Assets.load(pngUrl)
      const sheet = new Spritesheet(baseTexture, json)
      await sheet.parse()
      const frameNames = Object.keys(sheet.textures)
      frameNames.sort((a, b) => {
        const na = Number(a.match(/\d+/)?.[0]) || 0
        const nb = Number(b.match(/\d+/)?.[0]) || 0
        return na - nb
      })
      return frameNames.map(name => sheet.textures[name])
    }

    sharedAnimations = {
      up: await loadSheet(walkUpPng, walkUpJson),
      down: await loadSheet(walkDownPng, walkDownJson),
      left: await loadSheet(walkLeftPng, walkLeftJson),
      right: await loadSheet(walkRightPng, walkRightJson),
    }
    return sharedAnimations
  })()

  return textureLoadPromise
}

export class RemotePlayer {
  container: Container
  private sprite: AnimatedSprite
  private label: Text
  private tint: number
  private targetX: number
  private targetY: number
  private currentDir: Direction = 'down'
  private isMoving: boolean = false
  private displayName: string
  private loaded: boolean = false

  constructor(member: PartyMember) {
    this.container = new Container()
    this.displayName = member.display_name
    this.targetX = member.x
    this.targetY = member.y
    this.tint = TINTS[member.user_id % TINTS.length]

    this.sprite = new AnimatedSprite([Texture.EMPTY])
    this.sprite.anchor.set(0.5)
    this.sprite.scale.set(SPRITE_SCALE)
    this.sprite.animationSpeed = ANIMATION_SPEED
    this.sprite.tint = this.tint
    this.sprite.gotoAndStop(0)
    this.container.addChild(this.sprite)

    const labelBg = new Graphics()
    labelBg.roundRect(-40, 14, 80, 16, 0)
    labelBg.fill({ color: 0x1a120b, alpha: 0.8 })
    labelBg.stroke({ width: 1, color: this.tint })
    this.container.addChild(labelBg)

    this.label = new Text({
      text: member.display_name,
      style: {
        fontFamily: 'monospace',
        fontSize: 9,
        fill: 0xf4e8d0,
        align: 'center',
      },
    })
    this.label.anchor.set(0.5, 0)
    this.label.position.set(0, 16)
    this.container.addChild(this.label)

    this.container.position.set(member.x, member.y)

    this.loadTextures()
  }

  private async loadTextures() {
    try {
      const anims = await loadSharedAnimations()
      if (anims.down.length > 0) {
        this.sprite.textures = anims.down
        this.sprite.gotoAndStop(0)
        this.loaded = true
      }
    } catch (e) {
      console.error('[RemotePlayer] Failed to load textures', e)
    }
  }

  update(member: PartyMember) {
    if (member.display_name !== this.displayName) {
      this.displayName = member.display_name
      this.label.text = member.display_name
    }

    this.targetX = member.x
    this.targetY = member.y

    const dx = this.targetX - this.container.x
    const dy = this.targetY - this.container.y
    const dist = Math.hypot(dx, dy)

    this.container.x += dx * LERP_FACTOR
    this.container.y += dy * LERP_FACTOR

    this.isMoving = dist > 2

    if (this.loaded) {
      const dir = member.direction as Direction
      if (dir && dir !== this.currentDir) {
        this.currentDir = dir
        const anims = sharedAnimations
        if (anims && anims[dir]) {
          this.sprite.textures = anims[dir]
        }
      }

      if (this.isMoving) {
        this.sprite.play()
      } else {
        this.sprite.gotoAndStop(0)
      }
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}