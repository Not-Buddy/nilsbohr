import type { PartyMember, SceneRef } from '../types/PartyTypes'

export class MultiplayerBridge {
  remotePlayers: PartyMember[] = []
  localUserId: number = 0
  localScene: SceneRef = { type: 'world', id: 'overworld' }
  isActive: boolean = false

  private sendPositionFn: ((x: number, y: number, dir: string) => void) | null = null
  private sendSceneFn: ((scene: SceneRef) => void) | null = null
  private lastSent = 0
  private readonly THROTTLE_MS = 100

  setSendPosition(fn: (x: number, y: number, dir: string) => void) {
    this.sendPositionFn = fn
  }

  setSendScene(fn: (scene: SceneRef) => void) {
    this.sendSceneFn = fn
  }

  setRemotePlayers(players: PartyMember[]) {
    this.remotePlayers = players
  }

  setLocalUserId(id: number) {
    this.localUserId = id
  }

  setActive(active: boolean) {
    this.isActive = active
  }

  sendPosition(x: number, y: number, direction: string) {
    if (!this.isActive) return
    const now = performance.now()
    if (now - this.lastSent < this.THROTTLE_MS) return
    this.lastSent = now
    this.sendPositionFn?.(x, y, direction)
  }

  sendSceneTransition(scene: SceneRef) {
    if (!this.isActive) return
    this.localScene = scene
    this.sendSceneFn?.(scene)
  }

  getRemotePlayersInScene(): PartyMember[] {
    return this.remotePlayers.filter(p =>
      p.scene && p.scene.type === this.localScene.type && p.scene.id === this.localScene.id
    )
  }

  getAllRemotePlayers(): PartyMember[] {
    return this.remotePlayers
  }
}