import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Building } from '../types/SeedTypes';
import type { BiomePalette } from '../engine/CityGenerator/BiomeConfig';

export function createBuildingSprite(building: Building, isEmpty: boolean = false, biome?: BiomePalette): Container {
  const container = new Container();

  const size = clamp(
    70 + building.spec.loc * 0.03,
    40,
    100
  );

  const body = new Graphics();

  if (isEmpty) {
    // Dimmed, red-dashed appearance for empty buildings
    body
      .rect(-size / 2, -size / 2, size, size)
      .fill({ color: 0x1f2937, alpha: 0.5 })
      .stroke({ width: 2, color: 0xef4444, alpha: 0.6 });

    // Inner dashed-effect lines (simulated dash via short segments)
    const dashLen = 6
    const gapLen = 4
    const half = size / 2
    const drawDashedLine = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1
      const dy = y2 - y1
      const dist = Math.sqrt(dx * dx + dy * dy)
      const nx = dx / dist
      const ny = dy / dist
      let pos = 0
      while (pos < dist) {
        const endPos = Math.min(pos + dashLen, dist)
        body.moveTo(x1 + nx * pos, y1 + ny * pos)
        body.lineTo(x1 + nx * endPos, y1 + ny * endPos)
        pos = endPos + gapLen
      }
    }
    body.setStrokeStyle({ width: 1.5, color: 0xef4444, alpha: 0.4 })
    drawDashedLine(-half + 3, -half + 3, half - 3, -half + 3)  // top
    drawDashedLine(half - 3, -half + 3, half - 3, half - 3)    // right
    drawDashedLine(half - 3, half - 3, -half + 3, half - 3)    // bottom
    drawDashedLine(-half + 3, half - 3, -half + 3, -half + 3)  // left
    body.stroke()
  } else if (biome) {
    // Biome-themed building
    const fill = biome.buildingFill
    const fillAlpha = biome.buildingFillAlpha
    const stroke = biome.buildingStroke
    const strokeAlpha = biome.buildingStrokeAlpha

    switch (biome.buildingShape) {
      case 'rounded':
        body
          .roundRect(-size / 2, -size / 2, size, size, 8)
          .fill({ color: fill, alpha: fillAlpha })
          .stroke({ width: 3, color: stroke, alpha: strokeAlpha })
        break

      case 'diamond': {
        // Diamond: rotated square
        const hs = size / 2
        body
          .moveTo(0, -hs)
          .lineTo(hs, 0)
          .lineTo(0, hs)
          .lineTo(-hs, 0)
          .closePath()
          .fill({ color: fill, alpha: fillAlpha })
          .stroke({ width: 3, color: stroke, alpha: strokeAlpha })
        break
      }

      default: // 'rect'
        body
          .rect(-size / 2, -size / 2, size, size)
          .fill({ color: fill, alpha: fillAlpha })
          .stroke({ width: 3, color: stroke, alpha: strokeAlpha })
    }

    // Biome accent detail — small colored dot at top center
    body.circle(0, -size / 2 + 6, 3)
    body.fill({ color: biome.accentColor, alpha: 0.7 })
  } else {
    // Default fallback (no biome)
    body
      .rect(-size / 2, -size / 2, size, size)
      .fill(0x374151)
      .stroke({ width: 3, color: 0x111827, alpha: 0.8 });
  }

  container.addChild(body);

  const label = new Text({
    text: building.spec.name,
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      fill: isEmpty ? 0x6b7280 : 0xffffff,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: size - 8,
    }),
  });

  label.anchor.set(0.5);
  label.position.set(0, isEmpty ? 4 : 0);

  container.addChild(label);

  // Empty badge
  if (isEmpty) {
    const badge = new Text({
      text: '∅',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xef4444,
        fontWeight: 'bold',
      }),
    });
    badge.anchor.set(0.5);
    badge.position.set(0, -size / 2 + 12);
    container.addChild(badge);
  }

  (container as any).__building = building;
  (container as any).__isEmpty = isEmpty;

  container.eventMode = 'static'
  container.cursor = isEmpty ? 'not-allowed' : 'pointer'

  return container
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}