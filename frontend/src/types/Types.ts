import { Container } from 'pixi.js'
import type { WorldSeed } from './SeedTypes'


export interface EntityWrapper<TKind extends string, TSpec> {
  kind: TKind
  spec: TSpec
}


export interface Scene{
  mount(root: Container): void
  unmount(): void
}
