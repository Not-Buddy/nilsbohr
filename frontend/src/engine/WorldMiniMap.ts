// engine/WorldMiniMap.ts
// Minimap UI component for the world view showing cities and player position

import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { City } from '../types/SeedTypes'

export interface WorldMiniMapConfig {
    worldBounds: Rectangle
    size?: number
    margin?: number
    backgroundColor?: number
    borderColor?: number
    playerColor?: number
}

interface CityNode {
    city: City
    x: number
    y: number
    radius: number
    color: number
}

// Language-based color palette
const LANG_COLORS: Record<string, number> = {
    javascript: 0xf7df1e,
    typescript: 0x3178c6,
    rust: 0xdea584,
    python: 0x3572a5,
    go: 0x00add8,
    java: 0xb07219,
    cpp: 0xf34b7d,
    c: 0x555555,
    ruby: 0xcc342d,
    swift: 0xf05138,
    kotlin: 0x7f52ff,
    csharp: 0x178600,
    php: 0x4f5d95,
    default: 0x6b7280,
}

function getLangColor(lang: string): number {
    const key = lang.toLowerCase().replace(/[^a-z]/g, '')
    return LANG_COLORS[key] ?? LANG_COLORS.default
}

export class WorldMiniMap {
    container: Container
    private config: Required<WorldMiniMapConfig>
    private background: Graphics
    private citiesLayer: Graphics
    private labelsLayer: Container
    private playerDot: Graphics
    private scale: number
    private cityNodes: CityNode[] = []

    constructor(config: WorldMiniMapConfig) {
        this.config = {
            worldBounds: config.worldBounds,
            size: config.size ?? 200,
            margin: config.margin ?? 20,
            backgroundColor: config.backgroundColor ?? 0x0a0a0a,
            borderColor: config.borderColor ?? 0x333333,
            playerColor: config.playerColor ?? 0x00ff00,
        }

        const maxDim = Math.max(this.config.worldBounds.width, this.config.worldBounds.height)
        this.scale = this.config.size / maxDim

        this.container = new Container()
        this.container.label = 'WorldMiniMap'

        this.background = new Graphics()
        this.citiesLayer = new Graphics()
        this.labelsLayer = new Container()
        this.playerDot = new Graphics()

        this.container.addChild(this.background)
        this.container.addChild(this.citiesLayer)
        this.container.addChild(this.labelsLayer)
        this.container.addChild(this.playerDot)

        this.drawBackground()
        this.drawPlayerDot()
    }

    private drawBackground(): void {
        const { size, backgroundColor, borderColor } = this.config

        this.background
            .roundRect(0, 0, size, size, 10)
            .fill({ color: backgroundColor, alpha: 0.88 })
            .stroke({ width: 2, color: borderColor })

        // Title
        const title = new Text({
            text: '🌍 WORLD',
            style: {
                fontFamily: 'monospace',
                fontSize: 9,
                fill: 0x666666,
                fontWeight: 'bold',
            }
        })
        title.anchor.set(0.5, 0)
        title.position.set(size / 2, 4)
        this.container.addChild(title)
    }

    private drawPlayerDot(): void {
        // Outer glow
        this.playerDot
            .circle(0, 0, 7)
            .fill({ color: this.config.playerColor, alpha: 0.25 })
        // Inner dot
        this.playerDot
            .circle(0, 0, 4)
            .fill(this.config.playerColor)
            .stroke({ width: 1, color: 0xffffff })
    }

    /**
     * Set the cities to display on the minimap
     */
    setCities(cities: City[], positions: Map<string, { x: number; y: number; radius: number }>): void {
        this.citiesLayer.clear()
        this.labelsLayer.removeChildren()
        this.cityNodes = []

        const wb = this.config.worldBounds

        cities.forEach(city => {
            const pos = positions.get(city.spec.id)
            if (!pos) return

            const color = getLangColor(city.spec.language || city.spec.theme || '')

            const mx = (pos.x - wb.x) * this.scale
            const my = (pos.y - wb.y) * this.scale
            const mr = Math.max(4, pos.radius * this.scale)

            this.cityNodes.push({ city, x: mx, y: my, radius: mr, color })

            // City glow
            this.citiesLayer
                .circle(mx, my, mr + 3)
                .fill({ color, alpha: 0.15 })

            // City circle
            this.citiesLayer
                .circle(mx, my, mr)
                .fill({ color, alpha: 0.6 })
                .stroke({ width: 1, color, alpha: 0.9 })

            // City label (only if big enough)
            if (mr > 6) {
                const label = new Text({
                    text: city.spec.name.length > 8 ? city.spec.name.slice(0, 6) + '..' : city.spec.name,
                    style: {
                        fontFamily: 'monospace',
                        fontSize: 7,
                        fill: 0xaaaaaa,
                    }
                })
                label.anchor.set(0.5, 0)
                label.position.set(mx, my + mr + 2)
                this.labelsLayer.addChild(label)
            }
        })
    }

    /**
     * Update player position on minimap
     */
    updatePlayerPosition(worldX: number, worldY: number): void {
        const wb = this.config.worldBounds
        const x = (worldX - wb.x) * this.scale
        const y = (worldY - wb.y) * this.scale

        this.playerDot.position.set(
            Math.max(5, Math.min(this.config.size - 5, x)),
            Math.max(5, Math.min(this.config.size - 5, y))
        )
    }

    /**
     * Position minimap on screen (call after resize)
     */
    positionOnScreen(screenWidth: number, screenHeight: number): void {
        this.container.position.set(
            screenWidth - this.config.size - this.config.margin,
            screenHeight - this.config.size - this.config.margin
        )
    }

    destroy(): void {
        this.container.destroy({ children: true })
    }
}
