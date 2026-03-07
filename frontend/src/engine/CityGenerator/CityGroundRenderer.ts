// engine/CityGenerator/CityGroundRenderer.ts
// Renders procedural ground textures per district biome using PixiJS Graphics

import { Container, Graphics } from 'pixi.js'
import type { BiomePalette } from './BiomeConfig'
import type { DistrictPosition } from './types'

interface DistrictRenderInfo {
    id: string
    position: DistrictPosition
    biome: BiomePalette
}

/**
 * Render the city ground with per-district biome terrain.
 * Returns a Container with all ground graphics.
 */
export function renderCityGround(
    districts: DistrictRenderInfo[],
    cityWidth: number,
    cityHeight: number
): Container {
    const container = new Container()
    container.label = 'CityGround'

    // 1. Base ground (dark underlay beneath everything)
    const base = new Graphics()
    base.rect(0, 0, cityWidth, cityHeight)
    base.fill(0x0d0d0d)
    container.addChild(base)

    // 2. Per-district biome terrain
    for (const district of districts) {
        const terrain = renderDistrictTerrain(district)
        container.addChild(terrain)
    }

    // 3. Blend zones between close districts
    for (let i = 0; i < districts.length; i++) {
        for (let j = i + 1; j < districts.length; j++) {
            const blend = renderBlendZone(districts[i], districts[j])
            if (blend) container.addChild(blend)
        }
    }

    return container
}

/**
 * Render a single district's biome terrain.
 */
function renderDistrictTerrain(info: DistrictRenderInfo): Container {
    const { position: pos, biome } = info
    const container = new Container()
    container.label = `Terrain:${info.id}`

    const left = pos.x - pos.width / 2
    const top = pos.y - pos.height / 2
    const w = pos.width
    const h = pos.height

    // Biome ground fill
    const ground = new Graphics()
    ground.roundRect(left, top, w, h, 20)
    ground.fill({ color: biome.groundColor, alpha: 0.95 })
    container.addChild(ground)

    // Pattern overlay
    const pattern = new Graphics()
    pattern.setStrokeStyle({
        width: 1,
        color: biome.groundPatternColor,
        alpha: biome.groundPatternAlpha,
    })

    switch (biome.patternType) {
        case 'grid':
            drawGridPattern(pattern, left, top, w, h, biome.tileSize)
            break
        case 'hex':
            drawHexPattern(pattern, left, top, w, h, biome.tileSize)
            break
        case 'dots':
            drawDotPattern(pattern, left, top, w, h, biome.tileSize, biome.groundPatternColor, biome.groundPatternAlpha)
            break
        case 'diagonal':
            drawDiagonalPattern(pattern, left, top, w, h, biome.tileSize)
            break
    }

    if (biome.patternType !== 'dots') {
        pattern.stroke()
    }

    container.addChild(pattern)

    // Edge noise — scattered small rects near the border for organic feel
    const edgeNoise = renderEdgeNoise(left, top, w, h, biome)
    container.addChild(edgeNoise)

    return container
}

// =============================================================================
// Pattern Renderers
// =============================================================================

function drawGridPattern(g: Graphics, x: number, y: number, w: number, h: number, tileSize: number) {
    for (let gx = x; gx <= x + w; gx += tileSize) {
        g.moveTo(gx, y).lineTo(gx, y + h)
    }
    for (let gy = y; gy <= y + h; gy += tileSize) {
        g.moveTo(x, gy).lineTo(x + w, gy)
    }
}

function drawHexPattern(g: Graphics, x: number, y: number, w: number, h: number, tileSize: number) {
    const hexW = tileSize
    const hexH = tileSize * 0.866 // sqrt(3)/2

    for (let row = 0; row * hexH < h; row++) {
        const offsetX = row % 2 === 0 ? 0 : hexW / 2
        for (let col = 0; col * hexW < w + hexW; col++) {
            const cx = x + col * hexW + offsetX
            const cy = y + row * hexH

            if (cx < x - hexW || cx > x + w + hexW || cy < y - hexH || cy > y + h + hexH) continue

            // Draw hexagon
            const r = tileSize / 2.2
            for (let i = 0; i < 6; i++) {
                const angle1 = (Math.PI / 3) * i - Math.PI / 6
                const angle2 = (Math.PI / 3) * (i + 1) - Math.PI / 6
                g.moveTo(cx + r * Math.cos(angle1), cy + r * Math.sin(angle1))
                g.lineTo(cx + r * Math.cos(angle2), cy + r * Math.sin(angle2))
            }
        }
    }
}

function drawDotPattern(
    g: Graphics,
    x: number, y: number, w: number, h: number,
    tileSize: number,
    color: number,
    alpha: number
) {
    const dotRadius = 2
    for (let gx = x + tileSize / 2; gx < x + w; gx += tileSize) {
        for (let gy = y + tileSize / 2; gy < y + h; gy += tileSize) {
            // Slight offset using simple hash for organic feel
            const hash = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453
            const jx = (hash - Math.floor(hash)) * 6 - 3
            const jy = (Math.sin(gx * 269.5 + gy * 183.3) * 43758.5453 % 1) * 6 - 3

            g.circle(gx + jx, gy + jy, dotRadius)
            g.fill({ color, alpha: alpha * 0.8 })
        }
    }
}

function drawDiagonalPattern(g: Graphics, x: number, y: number, w: number, h: number, tileSize: number) {
    const spacing = tileSize
    // Top-left to bottom-right diagonals
    for (let offset = -h; offset < w + h; offset += spacing) {
        const x1 = x + offset
        const y1 = y
        const x2 = x + offset - h
        const y2 = y + h
        g.moveTo(Math.max(x, x1), y1 + Math.max(0, x - x1))
        g.lineTo(Math.max(x, x2), Math.min(y + h, y2))
    }
    // Top-right to bottom-left diagonals
    for (let offset = -h; offset < w + h; offset += spacing) {
        const x1 = x + offset
        const y1 = y + h
        const x2 = x + offset + h
        const y2 = y
        g.moveTo(Math.max(x, Math.min(x + w, x1)), Math.min(y + h, y1))
        g.lineTo(Math.max(x, Math.min(x + w, x2)), Math.max(y, y2))
    }
}

// =============================================================================
// Edge noise for organic biome boundaries
// =============================================================================

function renderEdgeNoise(x: number, y: number, w: number, h: number, biome: BiomePalette): Graphics {
    const g = new Graphics()
    const margin = 15 // how deep into the district the noise extends
    const count = Math.floor((w + h) / 20) // rough count based on perimeter

    for (let i = 0; i < count; i++) {
        const hash1 = Math.sin(i * 127.1 + x * 0.01) * 43758.5453
        const hash2 = Math.sin(i * 311.7 + y * 0.01) * 43758.5453
        const r1 = hash1 - Math.floor(hash1)
        const r2 = hash2 - Math.floor(hash2)

        // Pick a point along the perimeter
        const perim = r1 * 2 * (w + h)
        let px: number, py: number

        if (perim < w) {
            px = x + perim; py = y + r2 * margin
        } else if (perim < w + h) {
            px = x + w - r2 * margin; py = y + (perim - w)
        } else if (perim < 2 * w + h) {
            px = x + (2 * w + h - perim); py = y + h - r2 * margin
        } else {
            px = x + r2 * margin; py = y + (2 * (w + h) - perim)
        }

        const size = 3 + r1 * 5
        g.rect(px - size / 2, py - size / 2, size, size)
        g.fill({ color: biome.groundColor, alpha: 0.3 + r2 * 0.3 })
    }

    return g
}

// =============================================================================
// Blend zones between close districts
// =============================================================================

function renderBlendZone(a: DistrictRenderInfo, b: DistrictRenderInfo): Graphics | null {
    // Check if districts are close enough to need blending
    const dx = b.position.x - a.position.x
    const dy = b.position.y - a.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const threshold = (a.position.width + b.position.width) / 2 + 100

    if (dist > threshold) return null

    const g = new Graphics()

    // Draw a gradient strip between the two district centers
    const midX = (a.position.x + b.position.x) / 2
    const midY = (a.position.y + b.position.y) / 2
    const blendRadius = 40
    const steps = 8

    for (let i = 0; i < steps; i++) {
        const t = i / steps
        // Lerp color by mixing with bias
        const color = t < 0.5 ? a.biome.groundColor : b.biome.groundColor
        const alpha = 0.15 * (1 - Math.abs(t - 0.5) * 2)

        const offsetX = (dx / dist) * blendRadius * (t - 0.5) * 2
        const offsetY = (dy / dist) * blendRadius * (t - 0.5) * 2
        const perpX = -(dy / dist) * 30
        const perpY = (dx / dist) * 30

        g.moveTo(midX + offsetX - perpX, midY + offsetY - perpY)
        g.lineTo(midX + offsetX + perpX, midY + offsetY + perpY)
        g.stroke({ width: 10, color, alpha })
    }

    return g
}
