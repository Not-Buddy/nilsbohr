import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Building } from '../types/SeedTypes';

export function createBuildingSprite(building: Building): Container {
  const container = new Container();

  const size = clamp(
    70 + building.spec.loc * 0.03,
    40,
    100
  );

  const body = new Graphics();
  body
    .rect(-size / 2, -size / 2, size, size)
    .fill(0x374151)
    .stroke({ width: 3, color: 0x111827, alpha: 0.8 });

  container.addChild(body);

  const label = new Text({
    text: building.spec.name,
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 12,
      fill: 0xffffff,
      align: 'center',
      wordWrap: true,
      wordWrapWidth: size - 8,
    }),
  });

  label.anchor.set(0.5);
  label.position.set(0, 0);

  container.addChild(label);

  (container as any).__building = building;

  container.eventMode = 'static'
  container.cursor = 'pointer'

  return container
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}