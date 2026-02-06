import {
  Container,
  Graphics,
  Text,
  TextStyle,
} from 'pixi.js'
import type { City } from '../types/SeedTypes'

export function createCitySprite(city: City): Container {
  const container = new Container()
  container.label = city.spec.name

  const radius = clamp(
    40 + city.spec.stats.loc * 0.05,
    40,
    120
  )

  const body = new Graphics()

  body
    .circle(0, 0, radius)
    .fill(getThemeColor(city.spec.theme))
    .stroke({ width: 4, color: 0x000000, alpha: 0.6 })

  container.addChild(body)

  /* ──────────────────────────────
   * 3️⃣ Inner ring (language accent)
   * ────────────────────────────── */
  const ring = new Graphics()

  ring
    .circle(0, 0, radius * 0.7)
    .stroke({
      width: 3,
      color: getLanguageColor(city.spec.language),
      alpha: 0.9,
    })

  container.addChild(ring)

  /* ──────────────────────────────
   * 4️⃣ City label
   * ────────────────────────────── */
  const label = new Text({
    text: city.spec.name,
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 14,
      fill: 0xffffff,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: radius * 2,
    }),
  })

  label.anchor.set(0.5, 0)
  label.y = radius + 8

  container.addChild(label)

  /* ──────────────────────────────
   * 5️⃣ Metadata (useful later)
   * ────────────────────────────── */
  container.eventMode = 'static'
  container.cursor = 'default'
  //container.hitArea = body.getBounds()

  return container
}

function getThemeColor(theme: string): number {
  switch (theme) {
    case 'industrial': return 0x6b7280 // steel gray
    case 'neon':       return 0x22d3ee // cyan
    case 'nature':     return 0x22c55e // green
    default:           return 0x9ca3af // neutral
  }
}

function getLanguageColor(language: string): number {
  switch (language) {
    case 'rs': return 0xf97316 // rust orange
    case 'ts': return 0x3b82f6 // blue
    case 'js': return 0xfacc15 // yellow
    case 'py': return 0x10b981 // teal
    default:   return 0xffffff
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
