// scenes/BuildingScene.ts
// Interior scene showing rooms inside a building

import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { Scene } from '../types/Types'
import type { Building, Room, City } from '../types/SeedTypes'
import { SceneManager } from '../engine/SceneManager'
import { CityScene } from './CityScene'
import { Player, type CollisionRect } from '../sprites/Player'
import { Input } from '../engine/Inputs'
import { Camera } from '../engine/Camera'
import { createRoomSprite, layoutRooms } from '../sprites/Room'

export class BuildingScene implements Scene {
    container = new Container()
    private building: Building
    private city: City
    private manager: SceneManager
    private mounted = false
    private entryPosition: { x: number; y: number }  // Position to return to

    private camera = new Camera()
    private player?: Player
    private input?: Input
    private worldBounds = new Rectangle(0, 0, 1000, 800)
    private roomBounds: CollisionRect[] = []

    constructor(building: Building, city: City, manager: SceneManager, entryPosition: { x: number; y: number }) {
        this.building = building
        this.city = city
        this.manager = manager
        this.entryPosition = entryPosition
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

        // --- Layout and render rooms ---
        const placements = layoutRooms(rooms, worldW, worldH - 80)

        placements.forEach(placement => {
            const roomSprite = createRoomSprite(placement.room)
            roomSprite.position.set(placement.x, placement.y + 80) // Offset for header
            interior.addChild(roomSprite)

            // Add collision bounds
            this.roomBounds.push({
                x: placement.x - placement.width / 2,
                y: placement.y + 80 - placement.height / 2,
                width: placement.width,
                height: placement.height,
                enterable: false,
            })
        })

        this.camera.container.addChild(interior)

        // --- Player setup ---
        this.input = new Input()

        // Spawn at bottom center (entrance)
        const spawnX = worldW / 2
        const spawnY = worldH - 60
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

        this.input.updatePrevious()
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
}
