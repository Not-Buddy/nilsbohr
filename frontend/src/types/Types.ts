import { Container } from 'pixi.js'
// import type { WorldSeed } from './SeedTypes'


export interface EntityWrapper<TKind extends string, TSpec> {
  kind: TKind
  spec: TSpec
}

export interface Scene {
  container: Container
  mount(): void | Promise<void>
  update(dt: number): void
  unmount(): void
};

export type  WorldTerrainType = 'grass' | 'sand' | 'stone' | 'water'