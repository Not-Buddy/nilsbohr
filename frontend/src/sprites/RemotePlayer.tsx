import { Container, Graphics, Text } from 'pixi.js';
import type { PartyMember } from '../types/PartyTypes';

export function createRemotePlayerSprite(member: PartyMember): Container {
  const container = new Container();

  const body = new Graphics();
  body.circle(0, 0, 12);
  body.fill({ color: 0x00ff88, alpha: 0.9 });
  container.addChild(body);

  const label = new Text({
    text: member.display_name,
    style: {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0xffffff,
    },
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, 16);
  container.addChild(label);

  container.position.set(member.x, member.y);

  return container;
}

export function updateRemotePlayerSprite(sprite: Container, member: PartyMember): void {
  sprite.position.set(member.x, member.y);

  const label = sprite.children[1] as Text;
  if (label) {
    label.text = member.display_name;
  }
}
