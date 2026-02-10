// sprites/Room.ts
// Sprite for rendering rooms inside buildings

import { Container, Graphics, Text } from 'pixi.js'
import type { Room } from '../types/SeedTypes'

// Color coding by room type
const ROOM_COLORS: Record<string, number> = {
    function: 0x3b82f6,    // Blue
    method: 0x10b981,      // Green
    closure: 0xf59e0b,     // Amber
    impl_block: 0x8b5cf6,  // Purple
    constructor: 0xef4444, // Red
    default: 0x6b7280,     // Gray
}

export interface RoomPlacement {
    room: Room
    x: number
    y: number
    width: number
    height: number
}

export function createRoomSprite(room: Room): Container {
    const spec = room.spec
    const container = new Container()
    container.label = `Room:${spec.name}`

    // Calculate size based on LOC
    const baseSize = 60
    const locFactor = Math.min(spec.loc / 100, 2)
    const size = baseSize + locFactor * 40

    // Get color based on room type
    const color = ROOM_COLORS[spec.room_type] || ROOM_COLORS.default

    // Room floor/background
    const floor = new Graphics()
    floor.roundRect(-size / 2, -size / 2, size, size, 8)
    floor.fill({ color: color, alpha: 0.3 })
    floor.stroke({ width: 2, color: color, alpha: 0.8 })

    // Add glow if main/async
    if (spec.is_main) {
        floor.roundRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8, 10)
        floor.stroke({ width: 3, color: 0xffd700, alpha: 0.6 })
    }

    container.addChild(floor)

    // Room name label
    const nameText = new Text({
        text: spec.name.length > 12 ? spec.name.slice(0, 10) + '..' : spec.name,
        style: {
            fontFamily: 'monospace',
            fontSize: 11,
            fill: 0xffffff,
            align: 'center',
        }
    })
    nameText.anchor.set(0.5, 0.5)
    nameText.position.set(0, -8)
    container.addChild(nameText)

    // Room type label (smaller)
    const typeText = new Text({
        text: spec.room_type,
        style: {
            fontFamily: 'monospace',
            fontSize: 8,
            fill: color,
        }
    })
    typeText.anchor.set(0.5, 0.5)
    typeText.position.set(0, 8)
    container.addChild(typeText)

    // Async indicator
    if (spec.is_async) {
        const asyncBadge = new Graphics()
        asyncBadge.circle(size / 2 - 8, -size / 2 + 8, 6)
        asyncBadge.fill(0x06b6d4)
        container.addChild(asyncBadge)
    }

    // Store spec for collision detection
    ; (container as any).__room = room
        ; (container as any).__size = size

    return container
}

export function layoutRooms(rooms: Room[], buildingWidth: number, buildingHeight: number): RoomPlacement[] {
    const placements: RoomPlacement[] = []
    if (rooms.length === 0) return placements

    const margin = 40
    const availableW = buildingWidth - margin * 2
    const availableH = buildingHeight - margin * 2

    // Calculate room sizes based on LOC
    const roomSizes = rooms.map(room => {
        const baseSize = 60
        const locFactor = Math.min(room.spec.loc / 100, 2)
        return baseSize + locFactor * 40
    })

    // Simple grid layout
    const cols = Math.ceil(Math.sqrt(rooms.length))
    const rows = Math.ceil(rooms.length / cols)

    const cellW = availableW / cols
    const cellH = availableH / rows

    rooms.forEach((room, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const size = roomSizes[index]

        placements.push({
            room,
            x: margin + col * cellW + cellW / 2,
            y: margin + row * cellH + cellH / 2,
            width: size,
            height: size,
        })
    })

    return placements
}
