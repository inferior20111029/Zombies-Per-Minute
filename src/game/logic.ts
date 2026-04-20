import {
  BASE_CORE_HP,
  BASE_PLAYER_HP,
  BASE_PLAYER_ROLL_COOLDOWN,
  BASE_PLAYER_ROLL_SPEED,
  BASE_PLAYER_ROLL_TIME,
  BASE_PLAYER_SPEED,
  BASE_RELOAD_TIME,
  BASE_RIFLE_DAMAGE,
  BASE_RIFLE_FIRE_INTERVAL,
  BASE_UPGRADE_MODIFIERS,
  CELL_SIZE,
  CORE_CELL,
  GRID_SIZE,
  INITIAL_BUILD_TIME,
  MAX_LINK_DISTANCE,
  MAX_PICKUPS,
  MAX_TRACERS,
  MAX_WAVES,
  MAX_ZOMBIES,
  PLAYER_CLIP_SIZE,
  SALVAGE_CELLS,
  SCRAP_DEPOT_START_CELL,
  SPAWN_CELLS,
  STARTING_RESERVE_AMMO,
  STARTING_SCRAP,
  STRUCTURE_BUILD_ORDER,
  STRUCTURE_DEFS,
  TARGET_LINK_RULES,
  UPGRADE_DEFS,
  WAVE_DEFS,
  WORLD_HALF_EXTENT,
  BUILD_PHASE_TIME,
} from './data.ts'
import type {
  Cell,
  CoreState,
  HudState,
  InputState,
  LinkState,
  PickupVisualState,
  PlayerState,
  ResourceMap,
  RunState,
  SalvageNodeState,
  ScrapPickupState,
  StructureKind,
  StructureState,
  TracerState,
  UpgradeDef,
  UpgradeModifiers,
  Vec2,
  TracerVisualState,
  ZombieKind,
  ZombieState,
  ZombieVisualState,
} from './types.ts'

const DEAD_ZONE = { x: -9999, y: -9999 }

const ZOMBIE_STATS: Record<
  ZombieKind,
  { hp: number; speed: number; attackDamage: number; scrapValue: number; scale: number }
> = {
  walker: { hp: 50, speed: 2.45, attackDamage: 8, scrapValue: 10, scale: 1 },
  runner: { hp: 34, speed: 3.9, attackDamage: 7, scrapValue: 9, scale: 0.8 },
  brute: { hp: 118, speed: 1.72, attackDamage: 18, scrapValue: 20, scale: 1.4 },
}

export function makeResourceMap(
  scrap = 0,
  power = 0,
  ammo = 0,
): ResourceMap {
  return { scrap, power, ammo }
}

function cloneResourceMap(resourceMap: ResourceMap): ResourceMap {
  return makeResourceMap(resourceMap.scrap, resourceMap.power, resourceMap.ammo)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function distance(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function vecLength(vector: Vec2) {
  return Math.hypot(vector.x, vector.y)
}

function vecNormalize(vector: Vec2): Vec2 {
  const length = vecLength(vector)
  if (length <= 0.0001) {
    return { x: 0, y: 0 }
  }
  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

function vecScale(vector: Vec2, scalar: number): Vec2 {
  return { x: vector.x * scalar, y: vector.y * scalar }
}

function roundStat(value: number) {
  return Math.max(0, Math.round(value))
}

export function cellToWorld(cell: Cell): Vec2 {
  return {
    x: -WORLD_HALF_EXTENT + CELL_SIZE / 2 + cell.x * CELL_SIZE,
    y: -WORLD_HALF_EXTENT + CELL_SIZE / 2 + cell.y * CELL_SIZE,
  }
}

export function worldToCell(point: Vec2): Cell {
  return {
    x: clamp(
      Math.floor((point.x + WORLD_HALF_EXTENT) / CELL_SIZE),
      0,
      GRID_SIZE - 1,
    ),
    y: clamp(
      Math.floor((point.y + WORLD_HALF_EXTENT) / CELL_SIZE),
      0,
      GRID_SIZE - 1,
    ),
  }
}

function cellKey(cell: Cell) {
  return `${cell.x}:${cell.y}`
}

function isCellInBounds(cell: Cell) {
  return (
    cell.x >= 0 &&
    cell.x < GRID_SIZE &&
    cell.y >= 0 &&
    cell.y < GRID_SIZE
  )
}

export function getRollingZpm(killTimes: number[], now: number) {
  const windowStart = now - 60
  let total = 0
  for (const timestamp of killTimes) {
    if (timestamp >= windowStart) {
      total += 1
    }
  }
  return total
}

export function getAverageZpm(totalKills: number, elapsedSeconds: number) {
  if (elapsedSeconds <= 0) {
    return 0
  }
  return (totalKills / elapsedSeconds) * 60
}

function trimKillTimes(killTimes: number[], now: number) {
  const windowStart = now - 60
  while (killTimes.length > 0 && killTimes[0] < windowStart) {
    killTimes.shift()
  }
}

function getZombieScale(kind: ZombieKind) {
  return ZOMBIE_STATS[kind].scale
}

function getZombieDisplayColor(kind: ZombieKind, hitFlash: number) {
  const base =
    kind === 'walker'
      ? { r: 0.43, g: 0.75, b: 0.39 }
      : kind === 'runner'
        ? { r: 0.95, g: 0.69, b: 0.37 }
        : { r: 0.68, g: 0.39, b: 0.9 }
  const flash = clamp(hitFlash * 3.2, 0, 1)
  return {
    r: lerp(base.r, 1, flash),
    g: lerp(base.g, 0.72, flash),
    b: lerp(base.b, 0.72, flash),
  }
}

export function buildFlowField(
  structures: StructureState[],
  coreCell: Cell,
): number[][] {
  const costs = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => Number.POSITIVE_INFINITY),
  )
  const blocked = new Set<string>()
  const expensive = new Set<string>()

  for (const structure of structures) {
    if (structure.hp <= 0) {
      continue
    }
    if (structure.kind === 'barricade') {
      expensive.add(cellKey(structure.cell))
      continue
    }
    blocked.add(cellKey(structure.cell))
  }

  blocked.delete(cellKey(coreCell))
  const frontier: Cell[] = [coreCell]
  costs[coreCell.y][coreCell.x] = 0

  while (frontier.length > 0) {
    frontier.sort((a, b) => costs[a.y][a.x] - costs[b.y][b.x])
    const current = frontier.shift()!
    const baseCost = costs[current.y][current.x]

    for (const delta of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const next = { x: current.x + delta.x, y: current.y + delta.y }
      if (!isCellInBounds(next)) {
        continue
      }
      if (blocked.has(cellKey(next))) {
        continue
      }
      const moveCost = expensive.has(cellKey(next)) ? 4 : 1
      const candidate = baseCost + moveCost
      if (candidate < costs[next.y][next.x]) {
        costs[next.y][next.x] = candidate
        frontier.push(next)
      }
    }
  }

  return costs
}

function getNeighborCosts(costs: number[][], cell: Cell) {
  const neighbors: Array<{ cell: Cell; cost: number }> = []
  for (const delta of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const next = { x: cell.x + delta.x, y: cell.y + delta.y }
    if (!isCellInBounds(next)) {
      continue
    }
    neighbors.push({
      cell: next,
      cost: costs[next.y][next.x],
    })
  }
  neighbors.sort((a, b) => a.cost - b.cost)
  return neighbors
}

export function canPlaceStructure(
  kind: StructureKind,
  cell: Cell,
  structures: StructureState[],
): { ok: boolean; reason: string } {
  if (!isCellInBounds(cell)) {
    return { ok: false, reason: '超出可建造範圍。' }
  }
  if (cellKey(cell) === cellKey(CORE_CELL)) {
    return { ok: false, reason: '那個格位已被工廠核心占用。' }
  }
  if (SPAWN_CELLS.some((spawnCell) => cellKey(spawnCell) === cellKey(cell))) {
    return { ok: false, reason: '原型版不允許封住殭屍出生口。' }
  }
  if (SALVAGE_CELLS.some((salvageCell) => cellKey(salvageCell) === cellKey(cell))) {
    return { ok: false, reason: '請保留回收點的通路。' }
  }
  if (
    structures.some(
      (structure) =>
        structure.hp > 0 && cellKey(structure.cell) === cellKey(cell),
    )
  ) {
    return { ok: false, reason: '該格位已經被占用。' }
  }
  if (kind !== 'barricade') {
    const distanceToCore = distance(cellToWorld(cell), cellToWorld(CORE_CELL))
    if (distanceToCore < 3.1) {
      return { ok: false, reason: '核心周圍需要保留一些空間。' }
    }
  }
  return { ok: true, reason: '' }
}

export function canLinkStructures(
  fromStructure: StructureState,
  toStructure: StructureState,
  links: LinkState[],
  structures: StructureState[],
): { ok: boolean; reason: string } {
  if (fromStructure.id === toStructure.id) {
    return { ok: false, reason: '建築不能連到自己。' }
  }
  if (fromStructure.hp <= 0 || toStructure.hp <= 0) {
    return { ok: false, reason: '已毀損的建築無法連線。' }
  }
  const allowedSources = TARGET_LINK_RULES[toStructure.kind]
  if (!allowedSources.includes(fromStructure.kind)) {
    return {
      ok: false,
      reason: `${STRUCTURE_DEFS[fromStructure.kind].label} 無法供應給 ${STRUCTURE_DEFS[toStructure.kind].label}。`,
    }
  }
  if (
    links.some(
      (link) =>
        link.fromId === fromStructure.id && link.toId === toStructure.id,
    )
  ) {
    return { ok: false, reason: '這條連線已經存在。' }
  }
  const outgoingLinks = links.filter((link) => link.fromId === fromStructure.id)
  if (outgoingLinks.length >= STRUCTURE_DEFS[fromStructure.kind].linkSlots) {
    return {
      ok: false,
      reason: `${STRUCTURE_DEFS[fromStructure.kind].label} 已沒有可用連線槽。`,
    }
  }
  const targetInbound = links
    .map((link) => {
      if (link.toId !== toStructure.id) {
        return null
      }
      return structures.find((structure) => structure.id === link.fromId) ?? null
    })
    .filter((structure): structure is StructureState => structure !== null)
  if (targetInbound.some((structure) => structure.kind === fromStructure.kind)) {
    return {
      ok: false,
      reason: `${STRUCTURE_DEFS[toStructure.kind].label} 已經有來自 ${STRUCTURE_DEFS[fromStructure.kind].label} 的供應。`,
    }
  }
  const linkDistance = distance(
    cellToWorld(fromStructure.cell),
    cellToWorld(toStructure.cell),
  )
  if (linkDistance > MAX_LINK_DISTANCE) {
    return {
      ok: false,
      reason: '這條連線對原型版網路來說太長了。',
    }
  }
  return { ok: true, reason: '' }
}

function createZombiePool() {
  return Array.from({ length: MAX_ZOMBIES }, (_, index) => ({
    id: index,
    kind: 'walker' as ZombieKind,
    active: false,
    position: { ...DEAD_ZONE },
    hp: 0,
    maxHp: 0,
    speed: 0,
    attackDamage: 0,
    attackCooldown: 0,
    heading: 0,
    scrapValue: 0,
    hitFlash: 0,
  }))
}

function createPickupPool() {
  return Array.from({ length: MAX_PICKUPS }, (_, index) => ({
    id: index,
    active: false,
    position: { ...DEAD_ZONE },
    amount: 0,
    ttl: 0,
  }))
}

function createTracerPool() {
  return Array.from({ length: MAX_TRACERS }, (_, index) => ({
    id: index,
    active: false,
    start: { ...DEAD_ZONE },
    end: { ...DEAD_ZONE },
    ttl: 0,
  }))
}

function createZombieVisualPool(): ZombieVisualState[] {
  return Array.from({ length: MAX_ZOMBIES }, () => ({
    id: -1,
    position: { x: 0, y: 0 },
    heading: 0,
    scale: 1,
    color: { r: 0, g: 0, b: 0 },
  }))
}

function createPickupVisualPool(): PickupVisualState[] {
  return Array.from({ length: MAX_PICKUPS }, () => ({
    id: -1,
    position: { x: 0, y: 0 },
    scale: 1,
  }))
}

function createTracerVisualPool(): TracerVisualState[] {
  return Array.from({ length: MAX_TRACERS }, () => ({
    id: -1,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    alpha: 0,
  }))
}

function createSalvageNodes(): SalvageNodeState[] {
  return SALVAGE_CELLS.map((cell, index) => ({
    id: `salvage-${index + 1}`,
    cell,
    remaining: 120,
    harvestRate: 10,
  }))
}

function createRunState(): RunState {
  return {
    phase: 'build',
    waveIndex: 1,
    phaseTimeLeft: INITIAL_BUILD_TIME,
    playerHp: BASE_PLAYER_HP,
    coreHp: BASE_CORE_HP,
    resources: makeResourceMap(),
    liveZpm: 0,
    peakZpm: 0,
    averageZpm: 0,
    selectedUpgradeIds: [],
    totalKills: 0,
    elapsedTime: 0,
  }
}

function createInputState(): InputState {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    firing: false,
    aimPoint: cellToWorld(CORE_CELL),
    rollQueued: false,
    reloadQueued: false,
  }
}

function createPlayerState(): PlayerState {
  const position = cellToWorld({
    x: CORE_CELL.x,
    y: CORE_CELL.y + 4,
  })
  return {
    position,
    facing: -Math.PI / 2,
    hp: BASE_PLAYER_HP,
    maxHp: BASE_PLAYER_HP,
    clipAmmo: PLAYER_CLIP_SIZE,
    clipSize: PLAYER_CLIP_SIZE,
    reserveAmmo: STARTING_RESERVE_AMMO,
    fireCooldown: 0,
    reloadTimer: 0,
    rollCooldown: 0,
    rollTimer: 0,
    rollDirection: { x: 0, y: 1 },
    carriedScrap: STARTING_SCRAP,
  }
}

function createCoreState(): CoreState {
  return {
    cell: CORE_CELL,
    hp: BASE_CORE_HP,
    maxHp: BASE_CORE_HP,
  }
}

function makeStructureId(index: number) {
  return `structure-${index}`
}

function makeLinkId(index: number) {
  return `link-${index}`
}

function makeStructure(kind: StructureKind, cell: Cell, id: string): StructureState {
  return {
    id,
    kind,
    cell,
    hp: STRUCTURE_DEFS[kind].maxHp,
    maxHp: STRUCTURE_DEFS[kind].maxHp,
    stored: makeResourceMap(),
    cooldown: 0,
    working: false,
  }
}

function getAvailableUpgradeOptions(selectedIds: string[], count: number) {
  const pool = UPGRADE_DEFS.filter((upgrade) => !selectedIds.includes(upgrade.id))
  const working = pool.length >= count ? [...pool] : [...UPGRADE_DEFS]
  const selected: UpgradeDef[] = []
  while (working.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * working.length)
    const [upgrade] = working.splice(index, 1)
    if (!selected.some((item) => item.id === upgrade.id)) {
      selected.push(upgrade)
    }
  }
  return selected
}

export class GameSimulation {
  runState = createRunState()
  input = createInputState()
  player = createPlayerState()
  core = createCoreState()
  structures: StructureState[] = []
  links: LinkState[] = []
  zombies: ZombieState[] = createZombiePool()
  pickups: ScrapPickupState[] = createPickupPool()
  tracers: TracerState[] = createTracerPool()
  salvageNodes: SalvageNodeState[] = createSalvageNodes()
  modifiers: UpgradeModifiers = { ...BASE_UPGRADE_MODIFIERS }
  flowField = buildFlowField([], CORE_CELL)
  selectedBuildKind: StructureKind | null = 'generator'
  linkMode = false
  linkSourceId: string | null = null
  pendingUpgrades: UpgradeDef[] = []
  notification = '在第一波來襲前，先把第一條生產線搭起來。'
  initialBuild = true
  sceneRevision = 0
  combatElapsedTime = 0
  killTimes: number[] = []
  spawnedThisWave = 0
  waveSpawnTimer = 0
  private zombieVisuals: ZombieVisualState[] = createZombieVisualPool()
  private zombieVisualCount = 0
  private pickupVisuals: PickupVisualState[] = createPickupVisualPool()
  private pickupVisualCount = 0
  private tracerVisuals: TracerVisualState[] = createTracerVisualPool()
  private tracerVisualCount = 0
  private nextStructureIndex = 1
  private nextLinkIndex = 1

  constructor() {
    this.reset()
  }

  reset() {
    this.nextStructureIndex = 1
    this.nextLinkIndex = 1
    this.runState = createRunState()
    this.input = createInputState()
    this.player = createPlayerState()
    this.core = createCoreState()
    this.structures = [
      makeStructure(
        'scrap_depot',
        SCRAP_DEPOT_START_CELL,
        makeStructureId(this.nextStructureIndex++),
      ),
    ]
    this.links = []
    this.zombies = createZombiePool()
    this.pickups = createPickupPool()
    this.tracers = createTracerPool()
    this.salvageNodes = createSalvageNodes()
    this.modifiers = { ...BASE_UPGRADE_MODIFIERS }
    this.selectedBuildKind = 'generator'
    this.linkMode = false
    this.linkSourceId = null
    this.pendingUpgrades = []
    this.notification = '在第一波來襲前，先把第一條生產線搭起來。'
    this.initialBuild = true
    this.sceneRevision += 1
    this.combatElapsedTime = 0
    this.killTimes = []
    this.spawnedThisWave = 0
    this.waveSpawnTimer = 0
    this.flowField = buildFlowField(this.structures, this.core.cell)
    this.syncDerivedState()
  }

  setMoveKey(direction: 'forward' | 'back' | 'left' | 'right', pressed: boolean) {
    this.input[direction] = pressed
  }

  setAimPoint(point: Vec2) {
    this.input.aimPoint = {
      x: clamp(point.x, -WORLD_HALF_EXTENT + 1, WORLD_HALF_EXTENT - 1),
      y: clamp(point.y, -WORLD_HALF_EXTENT + 1, WORLD_HALF_EXTENT - 1),
    }
  }

  setFiring(active: boolean) {
    this.input.firing = active
  }

  queueRoll() {
    this.input.rollQueued = true
  }

  queueReload() {
    this.input.reloadQueued = true
  }

  selectBuildKind(kind: StructureKind | null) {
    this.selectedBuildKind = this.selectedBuildKind === kind ? null : kind
    this.notification = kind
      ? `已選擇 ${STRUCTURE_DEFS[kind].label}。請在建造階段點擊地面放置。`
      : '已取消建造選擇。'
  }

  toggleLinkMode() {
    if (this.runState.phase !== 'build') {
      this.notification = '只有在建造階段才能編輯連線。'
      return
    }
    this.linkMode = !this.linkMode
    this.linkSourceId = null
    this.notification = this.linkMode
      ? '連線模式啟用。先點來源，再點目標。'
      : '連線模式已關閉。'
  }

  tryPlaceStructure(point: Vec2) {
    if (this.runState.phase !== 'build') {
      this.notification = '只有在建造階段才能施工。'
      return false
    }
    if (!this.selectedBuildKind) {
      this.notification = '請先選擇要放置的建築。'
      return false
    }
    const cell = worldToCell(point)
    const placement = canPlaceStructure(
      this.selectedBuildKind,
      cell,
      this.structures,
    )
    if (!placement.ok) {
      this.notification = placement.reason
      return false
    }
    const cost = STRUCTURE_DEFS[this.selectedBuildKind].cost
    if (!this.spendScrap(cost)) {
      this.notification = '你身上與倉儲網路中的廢料都不夠。'
      return false
    }
    const structure = makeStructure(
      this.selectedBuildKind,
      cell,
      makeStructureId(this.nextStructureIndex++),
    )
    this.structures.push(structure)
    this.notification = `${STRUCTURE_DEFS[this.selectedBuildKind].label} 已部署。`
    this.sceneRevision += 1
    return true
  }

  handleStructureClick(structureId: string) {
    if (this.runState.phase !== 'build') {
      return
    }
    const structure = this.structures.find((item) => item.id === structureId)
    if (!structure) {
      return
    }
    if (!this.linkMode) {
      this.notification = `已選取 ${STRUCTURE_DEFS[structure.kind].label}。按 L 進入連線模式。`
      return
    }
    if (!this.linkSourceId) {
      if (STRUCTURE_DEFS[structure.kind].linkSlots <= 0) {
        this.notification = `${STRUCTURE_DEFS[structure.kind].label} 不能作為連線來源。`
        return
      }
      this.linkSourceId = structure.id
      this.notification = `${STRUCTURE_DEFS[structure.kind].label} 已鎖定為連線來源。`
      return
    }
    const fromStructure = this.structures.find(
      (item) => item.id === this.linkSourceId,
    )
    if (!fromStructure) {
      this.linkSourceId = null
      return
    }
    const validation = canLinkStructures(
      fromStructure,
      structure,
      this.links,
      this.structures,
    )
    if (!validation.ok) {
      if (fromStructure.id === structure.id) {
        this.linkSourceId = null
      }
      this.notification = validation.reason
      return
    }
    this.links.push({
      id: makeLinkId(this.nextLinkIndex++),
      fromId: fromStructure.id,
      toId: structure.id,
    })
    this.linkSourceId = null
    this.notification = `已將 ${STRUCTURE_DEFS[fromStructure.kind].label} 連到 ${STRUCTURE_DEFS[structure.kind].label}。`
    this.sceneRevision += 1
  }

  chooseUpgrade(upgradeId: string) {
    if (this.runState.phase !== 'upgrade') {
      return
    }
    const upgrade = this.pendingUpgrades.find((item) => item.id === upgradeId)
    if (!upgrade) {
      return
    }
    upgrade.apply(this.runState, this.modifiers)
    this.runState.selectedUpgradeIds = [
      ...this.runState.selectedUpgradeIds,
      upgrade.id,
    ]
    this.player.maxHp = BASE_PLAYER_HP + this.modifiers.playerMaxHpBonus
    this.player.hp = clamp(this.runState.playerHp, 0, this.player.maxHp)
    this.core.maxHp = BASE_CORE_HP + this.modifiers.coreMaxHpBonus
    this.core.hp = clamp(this.runState.coreHp, 0, this.core.maxHp)
    this.pendingUpgrades = []
    this.startBuildPhase(false)
  }

  tick(deltaTime: number) {
    const dt = Math.min(deltaTime, 0.033)
    this.updateTracers(dt)
    this.updatePickups(dt)

    if (this.runState.phase === 'summary' || this.runState.phase === 'game_over') {
      this.syncDerivedState()
      return
    }

    if (this.runState.phase === 'upgrade') {
      this.syncDerivedState()
      return
    }

    this.updatePlayer(dt)
    this.collectFieldResources(dt)
    this.depositScrapAtDepots(dt)
    this.updateLogistics(dt)

    if (this.runState.phase === 'build') {
      this.runState.phaseTimeLeft -= dt
      if (this.runState.phaseTimeLeft <= 0) {
        this.startAssault()
      }
      this.syncDerivedState()
      return
    }

    this.combatElapsedTime += dt
    this.runState.elapsedTime = this.combatElapsedTime
    this.runState.phaseTimeLeft -= dt
    this.updateWaveSpawning(dt)
    this.updateTurrets()
    this.updateZombies(dt)

    if (this.player.hp <= 0) {
      this.enterGameOver('工程師陣亡，整條防線隨之崩潰。')
    } else if (this.core.hp <= 0) {
      this.enterGameOver('工廠核心被屍潮攻破了。')
    } else if (this.runState.phaseTimeLeft <= 0) {
      if (this.runState.waveIndex >= MAX_WAVES) {
        this.runState.phase = 'summary'
        this.notification = '工廠撐住了，把這次成績收下吧。'
      } else {
        this.enterUpgradePhase()
      }
    }

    this.syncDerivedState()
  }

  createHudState(): HudState {
    return {
      phase: this.runState.phase,
      waveIndex: this.runState.waveIndex,
      phaseTimeLeft: this.runState.phaseTimeLeft,
      playerHp: roundStat(this.player.hp),
      playerMaxHp: roundStat(this.player.maxHp),
      coreHp: roundStat(this.core.hp),
      coreMaxHp: roundStat(this.core.maxHp),
      resources: cloneResourceMap(this.runState.resources),
      liveZpm: this.runState.liveZpm,
      peakZpm: this.runState.peakZpm,
      averageZpm: this.runState.averageZpm,
      totalKills: this.runState.totalKills,
      clipAmmo: this.player.clipAmmo,
      reserveAmmo: this.player.reserveAmmo,
      selectedBuildKind: this.selectedBuildKind,
      linkMode: this.linkMode,
      linkSourceId: this.linkSourceId,
      notification: this.notification,
      pendingUpgrades: this.pendingUpgrades,
      selectedUpgradeIds: this.runState.selectedUpgradeIds,
      structureSummaries: this.structures
        .filter((structure) => structure.hp > 0)
        .map((structure) => ({
          id: structure.id,
          kind: structure.kind,
          label: STRUCTURE_DEFS[structure.kind].label,
          hp: roundStat(structure.hp),
          stored: cloneResourceMap(structure.stored),
          linkCount: this.links.filter((link) => link.fromId === structure.id).length,
        })),
      totalStructures: this.structures.filter((structure) => structure.hp > 0).length,
      initialBuild: this.initialBuild,
    }
  }

  getStructureById(structureId: string) {
    return this.structures.find((structure) => structure.id === structureId) ?? null
  }

  private syncDerivedState() {
    trimKillTimes(this.killTimes, this.combatElapsedTime)
    this.runState.playerHp = roundStat(this.player.hp)
    this.runState.coreHp = roundStat(this.core.hp)
    this.runState.resources = this.computeResourceTotals()
    this.runState.liveZpm = getRollingZpm(this.killTimes, this.combatElapsedTime)
    this.runState.peakZpm = Math.max(this.runState.peakZpm, this.runState.liveZpm)
    this.runState.averageZpm = getAverageZpm(
      this.runState.totalKills,
      this.combatElapsedTime,
    )
    this.rebuildVisualState()
  }

  private rebuildVisualState() {
    let zombieIndex = 0
    for (const zombie of this.zombies) {
      if (!zombie.active) {
        continue
      }
      const zombieVisual = this.zombieVisuals[zombieIndex]
      zombieVisual.id = zombie.id
      zombieVisual.position.x = zombie.position.x
      zombieVisual.position.y = zombie.position.y
      zombieVisual.heading = zombie.heading
      zombieVisual.scale = getZombieScale(zombie.kind)

      const color = getZombieDisplayColor(zombie.kind, zombie.hitFlash)
      zombieVisual.color.r = color.r
      zombieVisual.color.g = color.g
      zombieVisual.color.b = color.b

      zombieIndex += 1
    }
    this.zombieVisualCount = zombieIndex

    let pickupIndex = 0
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }
      const pickupVisual = this.pickupVisuals[pickupIndex]
      pickupVisual.id = pickup.id
      pickupVisual.position.x = pickup.position.x
      pickupVisual.position.y = pickup.position.y
      pickupVisual.scale = clamp(pickup.amount / 14, 0.32, 0.76)
      pickupIndex += 1
    }
    this.pickupVisualCount = pickupIndex

    let tracerIndex = 0
    for (const tracer of this.tracers) {
      if (!tracer.active) {
        continue
      }
      const tracerVisual = this.tracerVisuals[tracerIndex]
      tracerVisual.id = tracer.id
      tracerVisual.start.x = tracer.start.x
      tracerVisual.start.y = tracer.start.y
      tracerVisual.end.x = tracer.end.x
      tracerVisual.end.y = tracer.end.y
      tracerVisual.alpha = clamp(tracer.ttl / 0.08, 0, 1)
      tracerIndex += 1
    }
    this.tracerVisualCount = tracerIndex
  }

  private computeResourceTotals(): ResourceMap {
    let scrap = this.player.carriedScrap
    let power = 0
    let ammo = this.player.reserveAmmo

    for (const structure of this.structures) {
      if (structure.hp <= 0) {
        continue
      }
      scrap += structure.stored.scrap
      power += structure.stored.power
      ammo += structure.stored.ammo
    }

    return makeResourceMap(scrap, power, ammo)
  }

  private startAssault() {
    const waveDef = WAVE_DEFS[this.runState.waveIndex - 1]
    this.runState.phase = 'assault'
    this.runState.phaseTimeLeft = waveDef.duration
    this.notification = `第 ${this.runState.waveIndex} 波即將突破防線。`
    this.initialBuild = false
    this.linkMode = false
    this.linkSourceId = null
    this.waveSpawnTimer = 0
    this.spawnedThisWave = 0
    this.flowField = buildFlowField(this.structures, this.core.cell)
  }

  private startBuildPhase(initialBuild: boolean) {
    this.runState.phase = 'build'
    this.runState.phaseTimeLeft = initialBuild ? INITIAL_BUILD_TIME : BUILD_PHASE_TIME
    this.notification = initialBuild
      ? '初始整備開始。先放下發電機、彈藥壓製機與自動砲塔。'
      : `建造窗口開啟，在第 ${this.runState.waveIndex + 1} 波前完成補強。`
    this.initialBuild = initialBuild
    this.linkMode = false
    this.linkSourceId = null
    this.flowField = buildFlowField(this.structures, this.core.cell)
    if (!initialBuild) {
      this.runState.waveIndex += 1
    }
  }

  private enterUpgradePhase() {
    this.runState.phase = 'upgrade'
    this.runState.phaseTimeLeft = 0
    this.pendingUpgrades = getAvailableUpgradeOptions(
      this.runState.selectedUpgradeIds,
      3,
    )
    this.notification = `第 ${this.runState.waveIndex} 波已清除，請選擇一項升級。`
  }

  private enterGameOver(message: string) {
    this.runState.phase = 'game_over'
    this.runState.phaseTimeLeft = 0
    this.notification = message
    this.input.firing = false
    this.linkMode = false
    this.linkSourceId = null
  }

  private spendScrap(amount: number) {
    let remaining = amount
    const carryBefore = this.player.carriedScrap
    const depotSnapshots = this.structures.map((structure) => structure.stored.scrap)
    const spendFromCarry = Math.min(this.player.carriedScrap, remaining)
    this.player.carriedScrap -= spendFromCarry
    remaining -= spendFromCarry

    if (remaining <= 0) {
      return true
    }

    for (const depot of this.structures) {
      if (depot.kind !== 'scrap_depot' || depot.hp <= 0) {
        continue
      }
      const spent = Math.min(depot.stored.scrap, remaining)
      depot.stored.scrap -= spent
      remaining -= spent
      if (remaining <= 0) {
        return true
      }
    }

    this.player.carriedScrap = carryBefore
    this.structures.forEach((structure, index) => {
      structure.stored.scrap = depotSnapshots[index]
    })
    return false
  }

  private updatePlayer(dt: number) {
    this.player.maxHp = BASE_PLAYER_HP + this.modifiers.playerMaxHpBonus
    this.player.hp = clamp(this.player.hp, 0, this.player.maxHp)
    this.core.maxHp = BASE_CORE_HP + this.modifiers.coreMaxHpBonus
    this.core.hp = clamp(this.core.hp, 0, this.core.maxHp)
    this.player.fireCooldown = Math.max(0, this.player.fireCooldown - dt)
    this.player.rollCooldown = Math.max(0, this.player.rollCooldown - dt)

    const direction = {
      x: (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0),
      y: (this.input.back ? 1 : 0) - (this.input.forward ? 1 : 0),
    }
    const moveDirection = vecNormalize(direction)

    if (this.input.rollQueued && this.player.rollCooldown <= 0) {
      const fallbackAim = vecNormalize({
        x: this.input.aimPoint.x - this.player.position.x,
        y: this.input.aimPoint.y - this.player.position.y,
      })
      this.player.rollDirection =
        vecLength(moveDirection) > 0 ? moveDirection : fallbackAim
      this.player.rollTimer = BASE_PLAYER_ROLL_TIME
      this.player.rollCooldown =
        BASE_PLAYER_ROLL_COOLDOWN * this.modifiers.rollCooldownMultiplier
    }
    this.input.rollQueued = false

    if (this.player.rollTimer > 0) {
      this.player.rollTimer = Math.max(0, this.player.rollTimer - dt)
      this.player.position = this.clampToWorld(
        vecAdd(
          this.player.position,
          vecScale(this.player.rollDirection, BASE_PLAYER_ROLL_SPEED * dt),
        ),
      )
    } else if (vecLength(moveDirection) > 0) {
      this.player.position = this.clampToWorld(
        vecAdd(
          this.player.position,
          vecScale(moveDirection, BASE_PLAYER_SPEED * dt),
        ),
      )
    }

    const aimDirection = vecNormalize({
      x: this.input.aimPoint.x - this.player.position.x,
      y: this.input.aimPoint.y - this.player.position.y,
    })
    if (vecLength(aimDirection) > 0) {
      this.player.facing = Math.atan2(aimDirection.x, aimDirection.y)
    }

    if (this.player.reloadTimer > 0) {
      this.player.reloadTimer = Math.max(0, this.player.reloadTimer - dt)
      if (this.player.reloadTimer <= 0) {
        this.finishReload()
      }
      return
    }

    if (
      this.input.reloadQueued ||
      (this.player.clipAmmo <= 0 &&
        (this.player.reserveAmmo > 0 || this.totalAmmoInNetwork() > 0))
    ) {
      this.startReload()
    }
    this.input.reloadQueued = false

    if (
      this.runState.phase === 'assault' &&
      this.input.firing &&
      this.player.fireCooldown <= 0 &&
      this.player.clipAmmo > 0
    ) {
      this.fireRifle()
    }
  }

  private fireRifle() {
    this.player.clipAmmo -= 1
    this.player.fireCooldown =
      BASE_RIFLE_FIRE_INTERVAL / this.modifiers.playerFireRateMultiplier

    const origin = this.player.position
    const direction = vecNormalize({
      x: this.input.aimPoint.x - origin.x,
      y: this.input.aimPoint.y - origin.y,
    })
    const maxRange = 16
    let bestTarget: ZombieState | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const zombie of this.zombies) {
      if (!zombie.active) {
        continue
      }
      const offset = {
        x: zombie.position.x - origin.x,
        y: zombie.position.y - origin.y,
      }
      const projectedDistance = offset.x * direction.x + offset.y * direction.y
      if (projectedDistance <= 0 || projectedDistance > maxRange) {
        continue
      }
      const lateral = Math.abs(offset.x * direction.y - offset.y * direction.x)
      if (lateral > 1.2) {
        continue
      }
      if (projectedDistance < bestDistance) {
        bestDistance = projectedDistance
        bestTarget = zombie
      }
    }

    const endPoint = bestTarget
      ? { ...bestTarget.position }
      : vecAdd(origin, vecScale(direction, maxRange))
    this.spawnTracer(origin, endPoint)

    if (bestTarget) {
      bestTarget.hp -= BASE_RIFLE_DAMAGE * this.modifiers.playerDamageMultiplier
      bestTarget.hitFlash = 0.35
      if (bestTarget.hp <= 0) {
        this.killZombie(bestTarget)
      }
    }

    if (
      this.player.clipAmmo <= 0 &&
      (this.player.reserveAmmo > 0 || this.totalAmmoInNetwork() > 0)
    ) {
      this.startReload()
    }
  }

  private startReload() {
    if (this.player.reloadTimer > 0 || this.player.clipAmmo >= this.player.clipSize) {
      return
    }
    if (this.player.reserveAmmo <= 0 && this.totalAmmoInNetwork() <= 0) {
      return
    }
    this.player.reloadTimer = BASE_RELOAD_TIME
    this.notification = '正在從剩餘備彈與工廠庫存中裝填。'
  }

  private finishReload() {
    const missingAmmo = this.player.clipSize - this.player.clipAmmo
    if (missingAmmo <= 0) {
      return
    }
    const fromReserve = Math.min(this.player.reserveAmmo, missingAmmo)
    this.player.reserveAmmo -= fromReserve
    this.player.clipAmmo += fromReserve
    const remaining = this.player.clipSize - this.player.clipAmmo
    if (remaining > 0) {
      this.player.clipAmmo += this.drainAmmoFromNetwork(remaining)
    }
  }

  private totalAmmoInNetwork() {
    return this.structures
      .filter((structure) => structure.kind === 'ammo_press' && structure.hp > 0)
      .reduce((total, structure) => total + structure.stored.ammo, 0)
  }

  private drainAmmoFromNetwork(amount: number) {
    let remaining = amount
    let transferred = 0
    for (const structure of this.structures) {
      if (structure.kind !== 'ammo_press' || structure.hp <= 0) {
        continue
      }
      const amountTaken = Math.min(structure.stored.ammo, remaining)
      structure.stored.ammo -= amountTaken
      transferred += amountTaken
      remaining -= amountTaken
      if (remaining <= 0) {
        break
      }
    }
    return transferred
  }

  private collectFieldResources(dt: number) {
    for (const salvageNode of this.salvageNodes) {
      if (salvageNode.remaining <= 0) {
        continue
      }
      const salvagePosition = cellToWorld(salvageNode.cell)
      if (distance(this.player.position, salvagePosition) > 2.25) {
        continue
      }
      const harvested = Math.min(
        salvageNode.remaining,
        salvageNode.harvestRate * this.modifiers.salvageMultiplier * dt,
      )
      salvageNode.remaining -= harvested
      this.player.carriedScrap += harvested
    }

    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }
      if (distance(this.player.position, pickup.position) <= 1.4) {
        pickup.active = false
        this.player.carriedScrap += pickup.amount
      }
    }
  }

  private depositScrapAtDepots(dt: number) {
    if (this.player.carriedScrap <= 0) {
      return
    }
    const nearbyDepots = this.structures.filter(
      (structure) =>
        structure.kind === 'scrap_depot' &&
        structure.hp > 0 &&
        distance(this.player.position, cellToWorld(structure.cell)) <= 2.4,
    )
    if (nearbyDepots.length <= 0) {
      return
    }
    const transfer = Math.min(this.player.carriedScrap, 22 * dt)
    nearbyDepots[0].stored.scrap += transfer
    this.player.carriedScrap -= transfer
  }

  private updateLogistics(dt: number) {
    for (const structure of this.structures) {
      if (structure.hp <= 0) {
        structure.working = false
        continue
      }
      structure.cooldown = Math.max(0, structure.cooldown - dt)
      structure.working = false
      if (structure.kind === 'generator') {
        this.updateGenerator(structure, dt)
      }
      if (structure.kind === 'ammo_press') {
        this.updateAmmoPress(structure, dt)
      }
      if (structure.kind === 'repair_station') {
        this.updateRepairStation(structure, dt)
      }
    }
  }

  private updateGenerator(generator: StructureState, dt: number) {
    const linkedDepots = this.getLinkedSources(generator.id, 'scrap_depot')
    if (linkedDepots.length <= 0) {
      return
    }
    const targetScrap = 1.45 * dt
    const scrapDrawn = this.pullResource(linkedDepots, 'scrap', targetScrap)
    if (scrapDrawn <= 0) {
      return
    }
    generator.stored.power = clamp(
      generator.stored.power +
        scrapDrawn * 8.5 * this.modifiers.generatorEfficiencyMultiplier,
      0,
      180,
    )
    generator.working = true
  }

  private updateAmmoPress(ammoPress: StructureState, dt: number) {
    const linkedDepots = this.getLinkedSources(ammoPress.id, 'scrap_depot')
    const linkedGenerators = this.getLinkedSources(ammoPress.id, 'generator')
    if (linkedDepots.length <= 0 || linkedGenerators.length <= 0) {
      return
    }
    const targetScrap = 0.9 * dt
    const targetPower = 3 * dt
    const drawnScrap = this.pullResource(linkedDepots, 'scrap', targetScrap)
    const drawnPower = this.pullResource(linkedGenerators, 'power', targetPower)
    const ratio = Math.min(
      drawnScrap / Math.max(targetScrap, 0.001),
      drawnPower / Math.max(targetPower, 0.001),
    )
    if (ratio <= 0) {
      return
    }
    ammoPress.stored.ammo = clamp(
      ammoPress.stored.ammo +
        8.4 * ratio * dt * this.modifiers.ammoPressEfficiencyMultiplier,
      0,
      STRUCTURE_DEFS.ammo_press.ammoCapacity ?? 120,
    )
    ammoPress.working = true
  }

  private updateRepairStation(repairStation: StructureState, dt: number) {
    const linkedGenerators = this.getLinkedSources(repairStation.id, 'generator')
    if (linkedGenerators.length <= 0) {
      return
    }
    const repairRadius = STRUCTURE_DEFS.repair_station.powerRadius ?? 6
    const stationPosition = cellToWorld(repairStation.cell)
    const damagedStructures = this.structures.filter(
      (structure) =>
        structure.hp > 0 &&
        structure.hp < structure.maxHp &&
        distance(stationPosition, cellToWorld(structure.cell)) <= repairRadius,
    )
    const canRepairPlayer =
      distance(this.player.position, stationPosition) <= repairRadius &&
      this.player.hp < this.player.maxHp
    const canRepairCore =
      distance(cellToWorld(this.core.cell), stationPosition) <= repairRadius &&
      this.core.hp < this.core.maxHp
    if (!canRepairPlayer && !canRepairCore && damagedStructures.length <= 0) {
      return
    }
    const targetPower = 1.8 * dt
    const pulledPower = this.pullResource(linkedGenerators, 'power', targetPower)
    if (pulledPower <= 0) {
      return
    }
    const repairBudget =
      pulledPower * 14 * this.modifiers.repairPowerEfficiencyMultiplier
    let remaining = repairBudget
    if (canRepairPlayer) {
      const repaired = Math.min(this.player.maxHp - this.player.hp, remaining)
      this.player.hp += repaired
      remaining -= repaired
    }
    if (remaining > 0 && canRepairCore) {
      const repaired = Math.min(this.core.maxHp - this.core.hp, remaining)
      this.core.hp += repaired
      remaining -= repaired
    }
    for (const structure of damagedStructures) {
      if (remaining <= 0) {
        break
      }
      const repaired = Math.min(structure.maxHp - structure.hp, remaining)
      structure.hp += repaired
      remaining -= repaired
    }
    repairStation.working = true
  }

  private updateWaveSpawning(dt: number) {
    const waveDef = WAVE_DEFS[this.runState.waveIndex - 1]
    this.waveSpawnTimer -= dt
    const spawnBudget = Math.round(waveDef.concurrentCap * 1.8)
    while (
      this.waveSpawnTimer <= 0 &&
      this.zombies.filter((zombie) => zombie.active).length < waveDef.concurrentCap &&
      this.spawnedThisWave < spawnBudget
    ) {
      this.spawnZombie(this.pickZombieKind(waveDef.spawnMix))
      this.waveSpawnTimer += Math.max(0.11, 0.74 - this.runState.waveIndex * 0.08)
      this.spawnedThisWave += 1
    }
  }

  private pickZombieKind(spawnMix: Record<ZombieKind, number>) {
    const roll = Math.random()
    let cursor = 0
    for (const kind of ['walker', 'runner', 'brute'] as ZombieKind[]) {
      cursor += spawnMix[kind]
      if (roll <= cursor) {
        return kind
      }
    }
    return 'walker'
  }

  private spawnZombie(kind: ZombieKind) {
    const zombie = this.zombies.find((candidate) => !candidate.active)
    if (!zombie) {
      return
    }
    const spawnCell = SPAWN_CELLS[Math.floor(Math.random() * SPAWN_CELLS.length)]
    const spawnPosition = cellToWorld(spawnCell)
    const jitter = { x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 1.2 }
    const stats = ZOMBIE_STATS[kind]
    zombie.kind = kind
    zombie.active = true
    zombie.position = vecAdd(spawnPosition, jitter)
    zombie.hp = stats.hp
    zombie.maxHp = stats.hp
    zombie.speed = stats.speed
    zombie.attackDamage = stats.attackDamage
    zombie.attackCooldown = 0
    zombie.heading = Math.atan2(
      this.core.cell.x - spawnCell.x,
      this.core.cell.y - spawnCell.y,
    )
    zombie.scrapValue = stats.scrapValue
    zombie.hitFlash = 0
  }

  private updateTurrets() {
    const activeZombies = this.zombies.filter((zombie) => zombie.active)
    if (activeZombies.length <= 0) {
      return
    }
    for (const turret of this.structures) {
      if (turret.kind !== 'auto_turret' || turret.hp <= 0) {
        continue
      }
      if (turret.cooldown > 0) {
        continue
      }
      const linkedGenerators = this.getLinkedSources(turret.id, 'generator')
      const linkedAmmoPresses = this.getLinkedSources(turret.id, 'ammo_press')
      if (linkedGenerators.length <= 0 || linkedAmmoPresses.length <= 0) {
        continue
      }
      const turretPosition = cellToWorld(turret.cell)
      let bestTarget: ZombieState | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      for (const zombie of activeZombies) {
        const targetDistance = distance(turretPosition, zombie.position)
        if (targetDistance > 8.6) {
          continue
        }
        if (targetDistance < bestDistance) {
          bestTarget = zombie
          bestDistance = targetDistance
        }
      }
      if (!bestTarget) {
        continue
      }
      const ammoDrawn = this.pullResource(linkedAmmoPresses, 'ammo', 1)
      const powerDrawn = this.pullResource(linkedGenerators, 'power', 0.6)
      if (ammoDrawn <= 0.99 || powerDrawn <= 0.59) {
        continue
      }
      bestTarget.hp -= 16 * this.modifiers.turretDamageMultiplier
      bestTarget.hitFlash = 0.28
      turret.cooldown =
        0.56 / this.modifiers.turretFireRateMultiplier + Math.random() * 0.05
      turret.working = true
      this.spawnTracer(turretPosition, bestTarget.position)
      if (bestTarget.hp <= 0) {
        this.killZombie(bestTarget)
      }
    }
  }

  private updateZombies(dt: number) {
    const corePosition = cellToWorld(this.core.cell)
    for (const zombie of this.zombies) {
      if (!zombie.active) {
        continue
      }
      zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt)
      zombie.hitFlash = Math.max(0, zombie.hitFlash - dt)

      const barricade = this.findBarricadeNear(zombie.position)
      if (barricade && distance(zombie.position, cellToWorld(barricade.cell)) <= 1.15) {
        if (zombie.attackCooldown <= 0) {
          barricade.hp -= zombie.attackDamage
          zombie.attackCooldown = zombie.kind === 'runner' ? 0.5 : 0.8
          if (barricade.hp <= 0) {
            barricade.hp = 0
            this.notification = '有一座路障倒下了，路線重新被打通。'
            this.flowField = buildFlowField(this.structures, this.core.cell)
            this.sceneRevision += 1
          }
        }
        continue
      }

      if (
        distance(zombie.position, this.player.position) <= 1.4 &&
        this.player.rollTimer <= 0
      ) {
        if (zombie.attackCooldown <= 0) {
          this.player.hp -= zombie.attackDamage
          zombie.attackCooldown = zombie.kind === 'runner' ? 0.52 : 0.82
        }
        continue
      }

      if (distance(zombie.position, corePosition) <= 1.9) {
        if (zombie.attackCooldown <= 0) {
          this.core.hp -= zombie.attackDamage
          zombie.attackCooldown = zombie.kind === 'runner' ? 0.6 : 0.9
        }
        continue
      }

      const target = this.getZombieMoveTarget(zombie.position)
      const moveDirection = vecNormalize({
        x: target.x - zombie.position.x,
        y: target.y - zombie.position.y,
      })
      const slowMultiplier = barricade ? 0.42 : 1
      zombie.heading = Math.atan2(moveDirection.x, moveDirection.y)
      zombie.position = this.clampToWorld(
        vecAdd(
          zombie.position,
          vecScale(moveDirection, zombie.speed * dt * slowMultiplier),
        ),
      )
    }
  }

  private getZombieMoveTarget(position: Vec2): Vec2 {
    const currentCell = worldToCell(position)
    const currentCost = this.flowField[currentCell.y][currentCell.x]
    const neighbors = getNeighborCosts(this.flowField, currentCell)
    const bestNeighbor =
      neighbors.find((neighbor) => neighbor.cost < currentCost) ?? null
    if (!bestNeighbor || !Number.isFinite(bestNeighbor.cost)) {
      return cellToWorld(this.core.cell)
    }
    return cellToWorld(bestNeighbor.cell)
  }

  private findBarricadeNear(point: Vec2) {
    return (
      this.structures.find(
        (structure) =>
          structure.kind === 'barricade' &&
          structure.hp > 0 &&
          distance(point, cellToWorld(structure.cell)) <= 1.45,
      ) ?? null
    )
  }

  private spawnTracer(start: Vec2, end: Vec2) {
    const tracer = this.tracers.find((candidate) => !candidate.active)
    if (!tracer) {
      return
    }
    tracer.active = true
    tracer.start = { ...start }
    tracer.end = { ...end }
    tracer.ttl = 0.08
  }

  private updateTracers(dt: number) {
    for (const tracer of this.tracers) {
      if (!tracer.active) {
        continue
      }
      tracer.ttl -= dt
      if (tracer.ttl <= 0) {
        tracer.active = false
      }
    }
  }

  private updatePickups(dt: number) {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }
      pickup.ttl -= dt
      if (pickup.ttl <= 0) {
        pickup.active = false
      }
    }
  }

  private killZombie(zombie: ZombieState) {
    const deathPosition = { ...zombie.position }
    zombie.active = false
    zombie.position = { ...DEAD_ZONE }
    this.runState.totalKills += 1
    this.killTimes.push(this.combatElapsedTime)
    const pickup = this.pickups.find((candidate) => !candidate.active)
    if (pickup) {
      pickup.active = true
      pickup.position = deathPosition
      pickup.amount =
        zombie.scrapValue * WAVE_DEFS[this.runState.waveIndex - 1].scrapDropBudget
      pickup.ttl = 12
    }
  }

  private clampToWorld(position: Vec2) {
    return {
      x: clamp(position.x, -WORLD_HALF_EXTENT + 0.8, WORLD_HALF_EXTENT - 0.8),
      y: clamp(position.y, -WORLD_HALF_EXTENT + 0.8, WORLD_HALF_EXTENT - 0.8),
    }
  }

  private getLinkedSources(targetId: string, expectedKind: StructureKind) {
    const sources: StructureState[] = []
    for (const link of this.links) {
      if (link.toId !== targetId) {
        continue
      }
      const structure = this.structures.find((item) => item.id === link.fromId)
      if (!structure || structure.kind !== expectedKind || structure.hp <= 0) {
        continue
      }
      sources.push(structure)
    }
    return sources
  }

  private pullResource(
    sources: StructureState[],
    resource: keyof ResourceMap,
    amount: number,
  ) {
    let remaining = amount
    let transferred = 0
    for (const source of sources) {
      const available = source.stored[resource]
      if (available <= 0) {
        continue
      }
      const taken = Math.min(available, remaining)
      source.stored[resource] -= taken
      remaining -= taken
      transferred += taken
      if (remaining <= 0) {
        break
      }
    }
    return transferred
  }

  getZombieVisualCount() {
    return this.zombieVisualCount
  }

  getZombieVisualStateAt(index: number) {
    return index < this.zombieVisualCount ? this.zombieVisuals[index] : null
  }

  getPickupVisualCount() {
    return this.pickupVisualCount
  }

  getPickupVisualStateAt(index: number) {
    return index < this.pickupVisualCount ? this.pickupVisuals[index] : null
  }

  getTracerVisualCount() {
    return this.tracerVisualCount
  }

  getTracerVisualStateAt(index: number) {
    return index < this.tracerVisualCount ? this.tracerVisuals[index] : null
  }

  getPreviewCell() {
    return worldToCell(this.input.aimPoint)
  }

  getPreviewValidity() {
    if (!this.selectedBuildKind) {
      return { ok: false, reason: '' }
    }
    return canPlaceStructure(
      this.selectedBuildKind,
      this.getPreviewCell(),
      this.structures,
    )
  }

  getBuildOrder() {
    return STRUCTURE_BUILD_ORDER
  }
}
