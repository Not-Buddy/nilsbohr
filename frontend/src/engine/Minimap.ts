// engine/Minimap.ts
// Minimap UI component showing world overview and player position

import { Container, Graphics, Rectangle } from 'pixi.js'

export interface MinimapConfig {
    worldBounds: Rectangle
    size?: number           // Size of minimap in pixels (default 150)
    margin?: number         // Margin from screen edge (default 20)
    backgroundColor?: number
    borderColor?: number
    playerColor?: number
    viewportColor?: number
}

interface MinimapDistrict {
    bounds: { x: number; y: number; width: number; height: number }
    color: number
}

export class Minimap {
    container: Container
    private config: Required<MinimapConfig>
    private background: Graphics
    private districtsLayer: Graphics
    private playerDot: Graphics
    private viewportRect: Graphics
    private scale: number

    constructor(config: MinimapConfig) {
        this.config = {
            worldBounds: config.worldBounds,
            size: config.size ?? 180,
            margin: config.margin ?? 20,
            backgroundColor: config.backgroundColor ?? 0x111111,
            borderColor: config.borderColor ?? 0x444444,
            playerColor: config.playerColor ?? 0x00ff00,
            viewportColor: config.viewportColor ?? 0xffffff,
        }

        // Calculate scale to fit world into minimap
        const maxDim = Math.max(this.config.worldBounds.width, this.config.worldBounds.height)
        this.scale = this.config.size / maxDim

        this.container = new Container()
        this.container.label = 'Minimap'

        // Create layers
        this.background = new Graphics()
        this.districtsLayer = new Graphics()
        this.viewportRect = new Graphics()
        this.playerDot = new Graphics()

        this.container.addChild(this.background)
        this.container.addChild(this.districtsLayer)
        this.container.addChild(this.viewportRect)
        this.container.addChild(this.playerDot)

        this.drawBackground()
        this.drawPlayerDot()
    }

    private drawBackground(): void {
        const { size, backgroundColor, borderColor } = this.config

        this.background
            .roundRect(0, 0, size, size, 8)
            .fill({ color: backgroundColor, alpha: 0.85 })
            .stroke({ width: 2, color: borderColor })
    }

    private drawPlayerDot(): void {
        this.playerDot
            .circle(0, 0, 5)
            .fill(this.config.playerColor)
            .stroke({ width: 1, color: 0xffffff })
    }

    /**
     * Set the districts to display on the minimap
     */
    setDistricts(districts: MinimapDistrict[]): void {
        this.districtsLayer.clear()

        districts.forEach(district => {
            const x = (district.bounds.x - this.config.worldBounds.x) * this.scale
            const y = (district.bounds.y - this.config.worldBounds.y) * this.scale
            const w = district.bounds.width * this.scale
            const h = district.bounds.height * this.scale

            this.districtsLayer
                .roundRect(x, y, w, h, 2)
                .fill({ color: district.color, alpha: 0.6 })
        })
    }

    /**
     * Update player position on minimap
     */
    updatePlayerPosition(worldX: number, worldY: number): void {
        const x = (worldX - this.config.worldBounds.x) * this.scale
        const y = (worldY - this.config.worldBounds.y) * this.scale

        // Clamp to minimap bounds
        this.playerDot.position.set(
            Math.max(5, Math.min(this.config.size - 5, x)),
            Math.max(5, Math.min(this.config.size - 5, y))
        )
    }

    /**
     * Update viewport rectangle showing visible area
     */
    updateViewport(viewX: number, viewY: number, viewWidth: number, viewHeight: number): void {
        this.viewportRect.clear()

        const x = (viewX - this.config.worldBounds.x) * this.scale
        const y = (viewY - this.config.worldBounds.y) * this.scale
        const w = viewWidth * this.scale
        const h = viewHeight * this.scale

        this.viewportRect
            .rect(x, y, w, h)
            .stroke({ width: 1, color: this.config.viewportColor, alpha: 0.5 })
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
