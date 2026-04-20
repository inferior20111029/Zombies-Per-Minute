import { describe, expect, it } from 'vitest'
import { SCRAP_DEPOT_START_CELL } from './data.ts'
import {
  GameSimulation,
  canLinkStructures,
  cellToWorld,
  getAverageZpm,
  getRollingZpm,
} from './logic.ts'

describe('zpm math', () => {
  it('calculates rolling zpm from the last 60 seconds', () => {
    expect(getRollingZpm([10, 20, 61, 75], 80)).toBe(3)
  })

  it('calculates average zpm across total elapsed time', () => {
    expect(getAverageZpm(45, 180)).toBeCloseTo(15)
  })
})

describe('link validation', () => {
  it('accepts a legal depot to generator link and rejects duplicates', () => {
    const sim = new GameSimulation()
    sim.selectBuildKind('generator')
    sim.tryPlaceStructure(cellToWorld({ x: 7, y: 10 }))
    const depot = sim.structures[0]
    const generator = sim.structures.find((structure) => structure.kind === 'generator')

    expect(generator).toBeTruthy()
    const valid = canLinkStructures(depot, generator!, sim.links, sim.structures)
    expect(valid.ok).toBe(true)

    sim.links.push({ id: 'test-link', fromId: depot.id, toId: generator!.id })
    const duplicate = canLinkStructures(depot, generator!, sim.links, sim.structures)
    expect(duplicate.ok).toBe(false)
  })
})

describe('factory chain and progression', () => {
  it('runs depot -> generator -> ammo press throughput during build', () => {
    const sim = new GameSimulation()
    sim.selectBuildKind('generator')
    sim.tryPlaceStructure(cellToWorld({ x: 7, y: 10 }))
    sim.selectBuildKind('ammo_press')
    sim.tryPlaceStructure(cellToWorld({ x: 8, y: 11 }))

    const depot = sim.structures.find((structure) => structure.kind === 'scrap_depot')!
    const generator = sim.structures.find((structure) => structure.kind === 'generator')!
    const ammoPress = sim.structures.find((structure) => structure.kind === 'ammo_press')!

    sim.links.push({ id: 'link-1', fromId: depot.id, toId: generator.id })
    sim.links.push({ id: 'link-2', fromId: depot.id, toId: ammoPress.id })
    sim.links.push({ id: 'link-3', fromId: generator.id, toId: ammoPress.id })

    sim.player.position = cellToWorld(SCRAP_DEPOT_START_CELL)
    for (let index = 0; index < 120; index += 1) {
      sim.tick(1 / 30)
    }

    expect(generator.stored.power).toBeGreaterThan(0)
    expect(ammoPress.stored.ammo).toBeGreaterThan(0)
  })

  it('transitions build -> assault -> upgrade -> build and increments the wave', () => {
    const sim = new GameSimulation()
    sim.runState.phaseTimeLeft = 0.001
    sim.tick(1 / 60)
    expect(sim.runState.phase).toBe('assault')

    sim.runState.phaseTimeLeft = 0.001
    sim.tick(1 / 60)
    expect(sim.runState.phase).toBe('upgrade')

    const upgrade = sim.pendingUpgrades[0]
    sim.chooseUpgrade(upgrade.id)
    expect(sim.runState.phase).toBe('build')
    expect(sim.runState.waveIndex).toBe(2)
    expect(sim.runState.selectedUpgradeIds).toContain(upgrade.id)
  })

  it('enters game over when the core falls', () => {
    const sim = new GameSimulation()
    sim.runState.phase = 'assault'
    sim.runState.phaseTimeLeft = 12
    sim.core.hp = 0
    sim.tick(1 / 60)
    expect(sim.runState.phase).toBe('game_over')
  })
})
