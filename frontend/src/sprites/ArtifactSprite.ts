// sprites/ArtifactSprite.ts
// Sprite for rendering artifacts (variables, constants, fields, etc.) inside rooms

import { Container, Graphics, Text } from 'pixi.js'
import type { Artifact } from '../types/SeedTypes'

// Color coding by artifact type
const ARTIFACT_COLORS: Record<string, number> = {
    variable: 0x3b82f6,     // Blue
    constant: 0xf59e0b,     // Amber
    parameter: 0x10b981,    // Green
    field: 0x8b5cf6,        // Purple
    property: 0x8b5cf6,     // Purple
    enum_variant: 0xec4899, // Pink
    type_alias: 0x14b8a6,   // Teal
    static: 0xef4444,       // Red
    default: 0x6b7280,      // Gray
}

// Icons by artifact type
const ARTIFACT_ICONS: Record<string, string> = {
    variable: '📦',
    constant: '🔒',
    parameter: '🏷️',
    field: '🔗',
    property: '🔗',
    enum_variant: '🔹',
    type_alias: '🔷',
    static: '⚡',
    default: '💎',
}

export interface ArtifactPlacement {
    artifact: Artifact
    x: number
    y: number
    width: number
    height: number
}

export function createArtifactSprite(artifact: Artifact): Container {
    const spec = artifact.spec
    const container = new Container()
    container.label = `Artifact:${spec.name}`

    const width = 120
    const height = 80

    const color = ARTIFACT_COLORS[spec.artifact_type] || ARTIFACT_COLORS.default
    const icon = ARTIFACT_ICONS[spec.artifact_type] || ARTIFACT_ICONS.default

    // Background panel
    const bg = new Graphics()
    bg.roundRect(-width / 2, -height / 2, width, height, 6)
    bg.fill({ color: color, alpha: 0.15 })
    bg.stroke({ width: 2, color: color, alpha: 0.7 })

    // Mutability glow — mutable artifacts get a pulsing outer border
    if (spec.is_mutable) {
        bg.roundRect(-width / 2 - 3, -height / 2 - 3, width + 6, height + 6, 8)
        bg.stroke({ width: 2, color: 0xff6b6b, alpha: 0.5 })
    }
    container.addChild(bg)

    // Icon
    const iconText = new Text({
        text: icon,
        style: {
            fontSize: 18,
        }
    })
    iconText.anchor.set(0.5, 0.5)
    iconText.position.set(0, -20)
    container.addChild(iconText)

    // Artifact name
    const nameText = new Text({
        text: spec.name.length > 14 ? spec.name.slice(0, 12) + '..' : spec.name,
        style: {
            fontFamily: 'monospace',
            fontSize: 11,
            fill: 0xffffff,
            align: 'center',
        }
    })
    nameText.anchor.set(0.5, 0.5)
    nameText.position.set(0, 2)
    container.addChild(nameText)

    // Datatype badge
    const dtLabel = spec.datatype.length > 12 ? spec.datatype.slice(0, 10) + '..' : spec.datatype
    const dtText = new Text({
        text: dtLabel,
        style: {
            fontFamily: 'monospace',
            fontSize: 8,
            fill: color,
        }
    })
    dtText.anchor.set(0.5, 0.5)
    dtText.position.set(0, 18)
    container.addChild(dtText)

    // Value hint (if present)
    if (spec.value_hint) {
        const hintText = new Text({
            text: `= ${spec.value_hint.length > 10 ? spec.value_hint.slice(0, 8) + '..' : spec.value_hint}`,
            style: {
                fontFamily: 'monospace',
                fontSize: 7,
                fill: 0x888888,
                fontStyle: 'italic',
            }
        })
        hintText.anchor.set(0.5, 0.5)
        hintText.position.set(0, 30)
        container.addChild(hintText)
    }

    // Store reference for interaction
    ; (container as any).__artifact = artifact
        ; (container as any).__width = width
        ; (container as any).__height = height

    return container
}

export function layoutArtifacts(artifacts: Artifact[], areaWidth: number, areaHeight: number): ArtifactPlacement[] {
    const placements: ArtifactPlacement[] = []
    if (artifacts.length === 0) return placements

    const itemW = 120
    const itemH = 80
    const margin = 40
    const gap = 20

    const availableW = areaWidth - margin * 2
    const availableH = areaHeight - margin * 2

    // Grid layout
    const cols = Math.max(1, Math.floor(availableW / (itemW + gap)))
    const rows = Math.ceil(artifacts.length / cols)

    const cellW = availableW / cols
    const cellH = Math.min((itemH + gap), availableH / Math.max(rows, 1))

    artifacts.forEach((artifact, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)

        placements.push({
            artifact,
            x: margin + col * cellW + cellW / 2,
            y: margin + row * cellH + cellH / 2,
            width: itemW,
            height: itemH,
        })
    })

    return placements
}
