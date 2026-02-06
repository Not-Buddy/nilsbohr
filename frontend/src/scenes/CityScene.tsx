// CityScene.ts
import { Container, Text } from 'pixi.js';
import type { Scene } from '../types/Types';
import type { City } from '../types/SeedTypes';
import { SceneManager } from '../engine/SceneManager';
import { Player } from '../sprites/Player';
import { Input } from '../engine/Inputs';

export class CityScene implements Scene {
    container = new Container()
    private city : City;

    private mounted = false;
    private player?: Player;
    private input?: Input;
    private manager: SceneManager;

    constructor( city: City, manager: SceneManager) {
    this.city = city;
    this.manager = manager;
    }

    mount() {
        if (this.mounted) return;
        this.mounted = true;
        const title = new Text("You entered "+this.city.spec.name+"! (Reload to leave lol)", {
            fill: '#000000',
            fontSize: 48,
        });

        title.position.set(100, 100);
        this.container.addChild(title);
    }

    update() {
        // nothing yet - should probably add a way to go back
    }

    unmount() {
        this.container.destroy({ children: true });
        this.mounted = false;
    }
}
