import { Assets, Texture, Sprite} from 'pixi.js';
import { useContext, useEffect, useRef, useState } from 'react';
import { useApplication, useTick} from '@pixi/react';
import bun from './assets/bun.jpg'

interface Position {
    x: number;
    y: number;
}

const movSpeed = 1;
export function PlayerSprite() {
    // The Pixi.js `Sprite`
    const spriteRef = useRef<Sprite>(null)

    const [texture, setTexture] = useState(Texture.EMPTY)

    const [pos, setPos] = useState<Position>({ x: screen.availWidth/2, y: (screen.availHeight/2)-200});
    const keys = useRef<Record<string, boolean>>({});

    // Preload the sprite if it hasn't been loaded yet
    useEffect(() => {
        if (texture === Texture.EMPTY) {
            Assets
                .load(bun)
                .then((result) => {
                    setTexture(result)
                });
        }
        const onKeyDown = (e: KeyboardEvent) => {
            console.log('key pressed '+e.code);
            
            keys.current[e.code] = true;
        };
        const onKeyUp = (e: KeyboardEvent) => {
            keys.current[e.code] = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [texture]);

    useTick(() => {
        const speed = 5 * movSpeed;

        setPos((prev) => {
            // Calculate new potential position
            let newX = keys.current['KeyD'] ? prev.x + speed : keys.current['KeyA'] ? prev.x - speed : prev.x;
            let newY = keys.current['KeyS'] ? prev.y + speed : keys.current['KeyW'] ? prev.y - speed : prev.y;

            /**
             * HARD GUARDS (Clamping)
             * We calculate the half-width/height so the bun doesn't 
             * stop halfway off the screen (since anchor is 0.5)
             */
            const halfWidth = (spriteRef.current?.width || 0) / 2;
            const halfHeight = (spriteRef.current?.height || 0) / 2;

            return {
                x: Math.max(halfWidth, Math.min(newX, screen.width - halfWidth)),
                y: Math.max(halfHeight, Math.min(newY, screen.height - halfHeight))
            };
        });
    });

    return (
        <pixiSprite
            ref={spriteRef}
            anchor={0.5}
            eventMode={'static'}
            scale={0.2}
            texture={texture}
            x={pos.x}
            y={pos.y} />
    );
}
