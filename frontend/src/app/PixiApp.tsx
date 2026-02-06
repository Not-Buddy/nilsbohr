// PixiApp.tsx
import { extend, Application } from '@pixi/react';
import { useRef, useEffect, useState } from 'react';
import { Container } from 'pixi.js';
import { SceneManager } from '../engine/SceneManager';
import { WorldScene } from '../scenes/WorldScene';
import type { WorldSeed } from '../types/SeedTypes';
import type { RootResponse } from '../types/SeedTypes';

import SampleData from '../assets/sample.json';
extend({ Container });

export default function PixiApp() {
  // const _stageRef = useRef<Container | null>(null);
  const managerRef = useRef<SceneManager | null>(null);

  const [seed, setSeed] = useState<WorldSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState<Container | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSeed() {
      try {
        console.log('fetching');
        
        //const res = await fetch('/assets/sample.json')
        //if (!res.ok) throw new Error('Failed to fetch seed')
          
        //const data = await res.json()
        const data = SampleData as unknown as RootResponse;

        console.log('Seed: ', data);

        if (!cancelled) setSeed(data.seed);
      } catch {
        if (!cancelled) setError('Failed to load world');
      }
    }

    fetchSeed()
    return () => { cancelled = true };
  }, [])

  useEffect(() => {
    if (!root || managerRef.current) return;
    console.log("instantiating scene manager");
    
    managerRef.current = new SceneManager(root);
  }, [root]);

  useEffect(() => {
    if (!seed || !managerRef.current) return;
    console.log("Mounting worldscene");
    

    managerRef.current.switch(
      new WorldScene(seed)
    );
  }, [seed, root]);

  return (
    <>
      <Application resizeTo={window} background="#1bd9c0ff">
        <pixiContainer ref={setRoot} />
      </Application>

      {!seed && !error && ( 
        <div className="loading-overlay">Loading world…</div>
      )}

      {error && (
        <div className="error-overlay">{error}</div>
      )}
    </>
  )
}
