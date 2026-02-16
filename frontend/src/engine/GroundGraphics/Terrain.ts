export class Terrain{
  private seed: number
  private heightCache = new Map<string, number>()
  private worldCenterX: number
  private worldCenterY: number
  private maxIslandRadius: number
  constructor(
    seed: number,
    worldCenterX: number,
    worldCenterY: number,
    maxIslandRadius: number
  ) {
    this.worldCenterX = worldCenterX
    this.worldCenterY = worldCenterY
    this.maxIslandRadius = maxIslandRadius
    this.seed = seed
  }


  private hash(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7 + this.seed * 101.3) * 43758.5453
    return s - Math.floor(s)
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
  }

  private valueNoise(x: number, y: number): number {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = x0 + 1
    const y1 = y0 + 1

    const sx = this.fade(x - x0)
    const sy = this.fade(y - y0)

    const n00 = this.hash(x0, y0)
    const n10 = this.hash(x1, y0)
    const n01 = this.hash(x0, y1)
    const n11 = this.hash(x1, y1)

    const ix0 = this.lerp(n00, n10, sx)
    const ix1 = this.lerp(n01, n11, sx)

    return this.lerp(ix0, ix1, sy)
  }

  private fbm(x: number, y: number, octaves = 5): number {
    let total = 0
    let frequency = 1
    let amplitude = 1
    let maxValue = 0

    for (let i = 0; i < octaves; i++) {
      total += this.valueNoise(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= 0.5
      frequency *= 2
    }

    return total / maxValue
  }

  public getHeight(x: number, y: number): number {
    const key = `${x},${y}`
    const cached = this.heightCache.get(key)
    if (cached !== undefined) return cached
    const scale = 0.001

    const nx = x * scale
    const ny = y * scale

    const continent = this.fbm(nx * 0.6, ny * 0.6, 5)
    const hills = this.fbm(nx * 2, ny * 2, 4) * 0.4
    const detail = this.fbm(nx * 6, ny * 6, 2) * 0.15

    let height = continent + hills + detail
    height *= this.getIslandMask(x, y)
    this.heightCache.set(key, height)

    return height
  }

  private getIslandMask(x: number, y: number): number {
    const dx = x - this.worldCenterX
    const dy = y - this.worldCenterY
    const distance = Math.sqrt(dx * dx + dy * dy)

    const t = distance / this.maxIslandRadius

    // Smooth falloff
    const falloff = 1 - this.smoothstep(0.7, 1.0, t)

    return Math.max(0, falloff)
  }

  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
  }


}