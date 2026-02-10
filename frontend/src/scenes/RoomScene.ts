// scenes/RoomScene.ts
// Interior scene showing artifacts inside a room

import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { Room, Building, City, Artifact } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { BuildingScene } from './BuildingScene'
import { Player, type CollisionRect } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createArtifactSprite, layoutArtifacts } from '../sprites/ArtifactSprite'

export class RoomScene implements Scene {
    container = new Container()
    private room: Room
    private building: Building
    private city: City
    private manager: SceneManager
    private mounted = false
    private entryPosition: { x: number; y: number }  // Position inside building to return to
    private cityEntryPosition: { x: number; y: number }  // City position to pass through

    private camera = new Camera()
    private player?: Player
    private input?: Input
    private worldBounds = new Rectangle(0, 0, 800, 600)
    private artifactBounds: CollisionRect[] = []

    constructor(
        room: Room,
        building: Building,
        city: City,
        manager: SceneManager,
        entryPosition: { x: number; y: number },
        cityEntryPosition: { x: number; y: number }
    ) {
        this.room = room
        this.building = building
        this.city = city
        this.manager = manager
        this.entryPosition = entryPosition
        this.cityEntryPosition = cityEntryPosition
    }

    async mount() {
        if (this.mounted) return
        this.mounted = true

        const spec = this.room.spec
        const artifacts = this.getArtifacts()

        // Calculate interior size based on artifact count
        const baseW = 700
        const baseH = 500
        const artifactFactor = Math.sqrt(artifacts.length + 1)
        const worldW = Math.max(baseW, baseW * artifactFactor * 0.5)
        const worldH = Math.max(baseH, baseH * artifactFactor * 0.5)
        this.worldBounds = new Rectangle(0, 0, worldW, worldH)

        // Setup camera
        this.container.addChild(this.camera.container)

        // --- Draw Interior ---
        const interior = new Container()
        interior.label = 'RoomInterior'

        // Floor — slightly different color from BuildingScene
        const floor = new Graphics()
        floor.rect(0, 0, worldW, worldH)
        floor.fill(0x0f172a)

        // Subtle hex grid pattern
        floor.setStrokeStyle({ width: 1, color: 0x1e3a5f, alpha: 0.4 })
        const tileSize = 40
        for (let x = 0; x < worldW; x += tileSize) {
            floor.moveTo(x, 0).lineTo(x, worldH)
        }
        for (let y = 0; y < worldH; y += tileSize) {
            floor.moveTo(0, y).lineTo(worldW, y)
        }
        floor.stroke()
        interior.addChild(floor)

        // Walls with room-type-specific accent color
        const accentColor = this.getRoomColor()
        const walls = new Graphics()
        walls.rect(8, 8, worldW - 16, worldH - 16)
        walls.stroke({ width: 4, color: accentColor, alpha: 0.6 })
        // Inner wall
        walls.rect(12, 12, worldW - 24, worldH - 24)
        walls.stroke({ width: 1, color: 0x334155 })
        interior.addChild(walls)

        // --- Header area ---
        const headerBg = new Graphics()
        headerBg.rect(12, 12, worldW - 24, 90)
        headerBg.fill({ color: 0x0f172a, alpha: 0.9 })
        headerBg.rect(12, 102, worldW - 24, 1)
        headerBg.fill({ color: accentColor, alpha: 0.4 })
        interior.addChild(headerBg)

        // Room name
        const typeIcon = this.getRoomIcon()
        const header = new Text({
            text: `${typeIcon} ${spec.name}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 18,
                fill: 0xffffff,
                fontWeight: 'bold',
            }
        })
        header.position.set(24, 20)
        interior.addChild(header)

        // Room metadata line 1
        const metaLine1 = new Text({
            text: `${spec.room_type} | LOC: ${spec.loc} | Complexity: ${spec.complexity} | Artifacts: ${artifacts.length}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 11,
                fill: 0x94a3b8,
            }
        })
        metaLine1.position.set(24, 46)
        interior.addChild(metaLine1)

        // Room metadata line 2 — params + return type
        const paramsText = spec.parameters || 'none'
        const returnText = spec.return_type || 'void'
        const metaLine2 = new Text({
            text: `params: ${paramsText.length > 40 ? paramsText.slice(0, 38) + '..' : paramsText} → ${returnText}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 10,
                fill: 0x64748b,
            }
        })
        metaLine2.position.set(24, 64)
        interior.addChild(metaLine2)

        // Badges (right side of header)
        let badgeX = worldW - 30
        if (spec.is_async) {
            const asyncBadge = this.createBadge('async', 0x06b6d4)
            asyncBadge.position.set(badgeX, 24)
            asyncBadge.anchor.set(1, 0)
            interior.addChild(asyncBadge)
            badgeX -= 60
        }
        if (spec.is_main) {
            const mainBadge = this.createBadge('main', 0xffd700)
            mainBadge.position.set(badgeX, 24)
            mainBadge.anchor.set(1, 0)
            interior.addChild(mainBadge)
            badgeX -= 60
        }
        if (spec.visibility) {
            const visBadge = this.createBadge(spec.visibility, 0x10b981)
            visBadge.position.set(badgeX, 24)
            visBadge.anchor.set(1, 0)
            interior.addChild(visBadge)
        }

        // Exit hint
        const exitHint = new Text({
            text: 'Press ESC to exit room',
            style: {
                fontFamily: 'monospace',
                fontSize: 11,
                fill: 0x475569,
            }
        })
        exitHint.anchor.set(1, 0)
        exitHint.position.set(worldW - 24, 82)
        interior.addChild(exitHint)

        // --- Layout and render artifacts ---
        const contentTop = 110
        const contentHeight = worldH - contentTop - 20

        if (artifacts.length > 0) {
            const placements = layoutArtifacts(artifacts, worldW, contentHeight)

            placements.forEach(placement => {
                const artSprite = createArtifactSprite(placement.artifact)
                artSprite.position.set(placement.x, placement.y + contentTop)
                interior.addChild(artSprite)

                // Collision bounds
                this.artifactBounds.push({
                    x: placement.x - placement.width / 2,
                    y: placement.y + contentTop - placement.height / 2,
                    width: placement.width,
                    height: placement.height,
                    enterable: false,
                })
            })
        } else {
            // Empty room message
            const emptyMsg = new Text({
                text: '— No artifacts in this room —',
                style: {
                    fontFamily: 'monospace',
                    fontSize: 14,
                    fill: 0x475569,
                    fontStyle: 'italic',
                }
            })
            emptyMsg.anchor.set(0.5, 0.5)
            emptyMsg.position.set(worldW / 2, contentTop + contentHeight / 2)
            interior.addChild(emptyMsg)
        }

        this.camera.container.addChild(interior)

        // --- Player setup ---
        this.input = new Input()

        const spawnX = worldW / 2
        const spawnY = worldH - 50
        this.player = new Player(spawnX, spawnY)
        await this.player.load()
        this.player.setCollisionBounds(this.artifactBounds)
        this.camera.container.addChild(this.player.sprite)

        // Camera setup
        this.camera.setBounds(this.worldBounds)
        this.camera.follow(this.player.sprite)
        this.camera.snapToTarget()
    }

    update(dt: number) {
        if (!this.player || !this.input) return

        this.player.update(dt, this.input)
        this.camera.update(dt)

        // ESC to exit back to building
        if (this.input.isJustPressed('Escape')) {
            this.manager.switch(
                new BuildingScene(this.building, this.city, this.manager, this.cityEntryPosition, this.entryPosition)
            )
            return
        }

        this.input.updatePrevious()
    }

    unmount() {
        this.input?.destroy()
        this.player?.destroy()
        this.container.destroy({ children: true })
        this.mounted = false
    }

    private getArtifacts(): Artifact[] {
        if (this.room.artifacts?.length) return this.room.artifacts
        const spec = this.room.spec as any
        if (spec.children && Array.isArray(spec.children)) {
            return spec.children.filter((e: any) => e.kind === 'Artifact')
        }
        return []
    }

    private getRoomColor(): number {
        const colors: Record<string, number> = {
            function: 0x3b82f6,
            method: 0x10b981,
            closure: 0xf59e0b,
            impl_block: 0x8b5cf6,
            constructor: 0xef4444,
        }
        return colors[this.room.spec.room_type] || 0x6b7280
    }

    private getRoomIcon(): string {
        const icons: Record<string, string> = {
            function: '⚙️',
            method: '🔧',
            closure: '🔄',
            impl_block: '🧱',
            constructor: '🏗️',
        }
        return icons[this.room.spec.room_type] || '📋'
    }

    private createBadge(text: string, color: number): Text {
        return new Text({
            text: `[${text}]`,
            style: {
                fontFamily: 'monospace',
                fontSize: 10,
                fill: color,
                fontWeight: 'bold',
            }
        })
    }
}
