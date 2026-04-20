import { create } from 'zustand'
import { GameSimulation } from './logic.ts'
import type { HudState, StructureKind, Vec2 } from './types.ts'

interface GameStore {
  mode: 'menu' | 'playing'
  simulation: GameSimulation
  hud: HudState
  sceneRevision: number
  startRun: () => void
  returnToMenu: () => void
  tick: (dt: number) => void
  setMoveKey: (
    direction: 'forward' | 'back' | 'left' | 'right',
    pressed: boolean,
  ) => void
  setAimPoint: (point: Vec2) => void
  setFiring: (active: boolean) => void
  queueRoll: () => void
  queueReload: () => void
  selectBuildKind: (kind: StructureKind | null) => void
  toggleLinkMode: () => void
  handleGroundClick: (point: Vec2) => void
  handleStructureClick: (structureId: string) => void
  chooseUpgrade: (upgradeId: string) => void
}

const simulation = new GameSimulation()
const HUD_SYNC_INTERVAL = 1 / 12
let hudSyncAccumulator = 0

function buildHudState(instance: GameSimulation) {
  return instance.createHudState()
}

export const useGameStore = create<GameStore>((set, get) => ({
  mode: 'menu',
  simulation,
  hud: buildHudState(simulation),
  sceneRevision: simulation.sceneRevision,
  startRun: () => {
    simulation.reset()
    hudSyncAccumulator = 0
    set({
      mode: 'playing',
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
  returnToMenu: () => {
    simulation.reset()
    hudSyncAccumulator = 0
    set({
      mode: 'menu',
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
  tick: (dt) => {
    simulation.tick(dt)
    hudSyncAccumulator += dt

    const state = get()
    const needsImmediateSync =
      simulation.sceneRevision !== state.sceneRevision ||
      simulation.runState.phase !== state.hud.phase ||
      simulation.runState.waveIndex !== state.hud.waveIndex ||
      simulation.notification !== state.hud.notification

    if (!needsImmediateSync && hudSyncAccumulator < HUD_SYNC_INTERVAL) {
      return
    }

    hudSyncAccumulator = 0
    set({
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
  setMoveKey: (direction, pressed) => {
    simulation.setMoveKey(direction, pressed)
  },
  setAimPoint: (point) => {
    simulation.setAimPoint(point)
  },
  setFiring: (active) => {
    simulation.setFiring(active)
  },
  queueRoll: () => {
    simulation.queueRoll()
  },
  queueReload: () => {
    simulation.queueReload()
  },
  selectBuildKind: (kind) => {
    simulation.selectBuildKind(kind)
    set({ hud: buildHudState(simulation) })
  },
  toggleLinkMode: () => {
    simulation.toggleLinkMode()
    set({
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
  handleGroundClick: (point) => {
    simulation.tryPlaceStructure(point)
    set({
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
  handleStructureClick: (structureId) => {
    simulation.handleStructureClick(structureId)
    set({
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
  chooseUpgrade: (upgradeId) => {
    simulation.chooseUpgrade(upgradeId)
    set({
      hud: buildHudState(simulation),
      sceneRevision: simulation.sceneRevision,
    })
  },
}))
