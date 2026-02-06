// PixiApp.tsx
import { extend, Application } from '@pixi/react'
import { useRef, useEffect, useState } from 'react'
import { Container } from 'pixi.js'
import { SceneManager } from '../engine/SceneManager'
import { WorldScene } from '../scenes/WorldScene'
import type { WorldSeed } from '../types/SeedTypes'
import type { RootResponse } from '../types/SeedTypes'

import SampleData from '../assets/sample.json'
extend({ Container })

export default function PixiApp() {
  const stageRef = useRef<Container | null>(null)
  const managerRef = useRef<SceneManager | null>(null)

  const [seed, setSeed] = useState<WorldSeed | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchSeed() {
      try {
        console.log('fetching');
        
        //const res = await fetch('/assets/sample.json')
        //if (!res.ok) throw new Error('Failed to fetch seed')
          
        //const data = await res.json()
        const data = SampleData as unknown as RootResponse;

        console.log('Seed: ', data);

        if (!cancelled) setSeed(data.seed)
      } catch {
        if (!cancelled) setError('Failed to load world')
      }
    }

    fetchSeed()
    return () => { cancelled = true }
  }, [])

  /* 2️⃣ Create SceneManager once */
  useEffect(() => {
    if (!stageRef.current || managerRef.current) return
    managerRef.current = new SceneManager(stageRef.current)
  }, [])

  /* 3️⃣ Mount WorldScene once seed arrives */
  useEffect(() => {
    if (!seed || !managerRef.current) return

    managerRef.current.switch(
      new WorldScene(seed)
    )
  }, [seed])

  return (
    <>
      <Application resizeTo={window} background="#000000">
        <pixiContainer ref={stageRef} />
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
