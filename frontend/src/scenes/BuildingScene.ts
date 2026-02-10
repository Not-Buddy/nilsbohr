// scenes/BuildingScene.ts
// Interior scene showing rooms inside a building

import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { Building, Room, City, Artifact } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { CityScene } from './CityScene'
import { RoomScene } from './RoomScene'
import { Player, type CollisionRect } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createRoomSprite, layoutRooms } from '../sprites/Room'
import { createArtifactSprite, layoutArtifacts } from '../sprites/ArtifactSprite'

export class BuildingScene implements Scene {
    container = new Container()
    private building: Building
    private city: City
    private manager: SceneManager
    private mounted = false
    private entryPosition: { x: number; y: number }  // City position to return to
    private buildingSpawnPosition?: { x: number; y: number }  // Position inside building (when returning from room)

    private camera = new Camera()
    private player?: Player
    private input?: Input
    private worldBounds = new Rectangle(0, 0, 1000, 800)
    private roomBounds: CollisionRect[] = []
    private nearbyRoom?: Room
    private enterPrompt?: Container

    constructor(building: Building, city: City, manager: SceneManager, entryPosition: { x: number; y: number }, buildingSpawnPosition?: { x: number; y: number }) {
        this.building = building
        this.city = city
        this.manager = manager
        this.entryPosition = entryPosition
        this.buildingSpawnPosition = buildingSpawnPosition
    }

    async mount() {
        if (this.mounted) return
        this.mounted = true

        const spec = this.building.spec
        const rooms = this.getRooms()

        // Calculate interior size based on building
        const baseW = 800
        const baseH = 600
        const roomFactor = Math.sqrt(rooms.length + 1)
        const worldW = Math.max(baseW, baseW * roomFactor * 0.6)
        const worldH = Math.max(baseH, baseH * roomFactor * 0.6)
        this.worldBounds = new Rectangle(0, 0, worldW, worldH)

        // Setup camera
        this.container.addChild(this.camera.container)

        // --- Draw Interior ---
        const interior = new Container()
        interior.label = 'BuildingInterior'

        // Floor
        const floor = new Graphics()
        floor.rect(0, 0, worldW, worldH)
        floor.fill(0x1a1a2e)

        // Floor pattern (tiles)
        floor.setStrokeStyle({ width: 1, color: 0x2a2a4e, alpha: 0.5 })
        const tileSize = 50
        for (let x = 0; x < worldW; x += tileSize) {
            floor.moveTo(x, 0).lineTo(x, worldH)
        }
        for (let y = 0; y < worldH; y += tileSize) {
            floor.moveTo(0, y).lineTo(worldW, y)
        }
        floor.stroke()
        interior.addChild(floor)

        // Walls
        const walls = new Graphics()
        walls.rect(10, 10, worldW - 20, worldH - 20)
        walls.stroke({ width: 6, color: 0x4a4a6a })
        interior.addChild(walls)

        // Building name header
        const header = new Text({
            text: `📁 ${spec.name}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 18,
                fill: 0xffffff,
                fontWeight: 'bold',
            }
        })
        header.position.set(30, 20)
        interior.addChild(header)

        // Building info
        const info = new Text({
            text: `Type: ${spec.building_type} | LOC: ${spec.loc} | Rooms: ${rooms.length}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 12,
                fill: 0x888888,
            }
        })
        info.position.set(30, 45)
        interior.addChild(info)

        // Exit hint
        const exitHint = new Text({
            text: 'Press ESC to exit building',
            style: {
                fontFamily: 'monospace',
                fontSize: 11,
                fill: 0x666666,
            }
        })
        exitHint.anchor.set(1, 0)
        exitHint.position.set(worldW - 30, 20)
        interior.addChild(exitHint)

        // --- Layout and render rooms or direct artifacts ---
        if (rooms.length > 0) {
            const placements = layoutRooms(rooms, worldW, worldH - 80)

            placements.forEach(placement => {
                const roomSprite = createRoomSprite(placement.room)
                roomSprite.position.set(placement.x, placement.y + 80) // Offset for header
                interior.addChild(roomSprite)

                // Add collision bounds with room reference for entry detection
                const bounds = {
                    x: placement.x - placement.width / 2,
                    y: placement.y + 80 - placement.height / 2,
                    width: placement.width,
                    height: placement.height,
                    enterable: false,
                    roomRef: placement.room,
                }
                this.roomBounds.push(bounds as CollisionRect)
            })
        } else {
            // No rooms — check for direct artifacts at building level
            const directArtifacts = this.getDirectArtifacts()

            if (directArtifacts.length > 0) {
                const artPlacements = layoutArtifacts(directArtifacts, worldW, worldH - 80)

                artPlacements.forEach(placement => {
                    const artSprite = createArtifactSprite(placement.artifact)
                    artSprite.position.set(placement.x, placement.y + 80)
                    interior.addChild(artSprite)

                    this.roomBounds.push({
                        x: placement.x - placement.width / 2,
                        y: placement.y + 80 - placement.height / 2,
                        width: placement.width,
                        height: placement.height,
                        enterable: false,
                    })
                })
            } else {
                // Truly empty building
                const emptyMsg = new Text({
                    text: '— Empty building (no functions or variables) —',
                    style: {
                        fontFamily: 'monospace',
                        fontSize: 14,
                        fill: 0x475569,
                        fontStyle: 'italic',
                    }
                })
                emptyMsg.anchor.set(0.5, 0.5)
                emptyMsg.position.set(worldW / 2, worldH / 2)
                interior.addChild(emptyMsg)
            }
        }

        this.camera.container.addChild(interior)

        // --- Player setup ---
        this.input = new Input()

        // Spawn at saved position (returning from room) or bottom center (entering from city)
        const spawnX = this.buildingSpawnPosition?.x ?? worldW / 2
        const spawnY = this.buildingSpawnPosition?.y ?? worldH - 60
        this.player = new Player(spawnX, spawnY)
        await this.player.load()
        this.player.setCollisionBounds(this.roomBounds)
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

        // Check for ESC to exit
        if (this.input.isJustPressed('Escape')) {
            this.manager.switch(new CityScene(this.city, this.manager, this.entryPosition))
            return
        }

        // Check for nearby rooms (for entry)
        this.nearbyRoom = undefined
        const playerX = this.player.sprite.x
        const playerY = this.player.sprite.y

        for (const bounds of this.roomBounds) {
            const room = (bounds as any).roomRef as Room | undefined
            if (!room) continue

            // Check if player is near bottom of room (entry zone)
            const nearBottom =
                playerX > bounds.x &&
                playerX < bounds.x + bounds.width &&
                playerY > bounds.y + bounds.height - 10 &&
                playerY < bounds.y + bounds.height + 50

            if (nearBottom) {
                this.nearbyRoom = room
                break
            }
        }

        // Show/hide entry prompt
        if (this.nearbyRoom) {
            this.showEnterPrompt()

            if (this.input.isJustPressed('KeyJ')) {
                const buildingPos = { x: this.player.sprite.x, y: this.player.sprite.y }
                this.manager.switch(
                    new RoomScene(this.nearbyRoom, this.building, this.city, this.manager, buildingPos, this.entryPosition)
                )
                return
            }
        } else {
            this.hideEnterPrompt()
        }

        this.input.updatePrevious()
    }

    private showEnterPrompt(): void {
        if (!this.enterPrompt) {
            this.enterPrompt = new Container()

            const bg = new Graphics()
            bg.roundRect(-110, -22, 220, 44, 10)
            bg.fill({ color: 0x000000, alpha: 0.85 })
            bg.stroke({ width: 2, color: 0x3b82f6 })
            this.enterPrompt.addChild(bg)

            const text = new Text({
                text: 'Press J to Enter Room',
                style: {
                    fontFamily: 'monospace',
                    fontSize: 15,
                    fill: 0x3b82f6,
                }
            })
            text.anchor.set(0.5, 0.5)
            this.enterPrompt.addChild(text)

            this.container.addChild(this.enterPrompt)
        }

        this.enterPrompt.position.set(
            window.innerWidth / 2,
            window.innerHeight - 80
        )
        this.enterPrompt.visible = true
    }

    private hideEnterPrompt(): void {
        if (this.enterPrompt) {
            this.enterPrompt.visible = false
        }
    }

    unmount() {
        this.input?.destroy()
        this.player?.destroy()
        this.container.destroy({ children: true })
        this.mounted = false
    }

    private getRooms(): Room[] {
        if (this.building.rooms?.length) return this.building.rooms
        const spec = this.building.spec as any
        if (spec.children && Array.isArray(spec.children)) {
            return spec.children.filter((e: any) => e.kind === 'Room')
        }
        return []
    }

    private getDirectArtifacts(): Artifact[] {
        const spec = this.building.spec as any
        if (spec.children && Array.isArray(spec.children)) {
            return spec.children.filter((e: any) => e.kind === 'Artifact')
        }
        return []
    }
}
