export type GamePhase = 'assault' | 'upgrade' | 'build' | 'summary' | 'game_over'

export type ResourceType = 'scrap' | 'power' | 'ammo'

export type StructureKind =
  | 'scrap_depot'
  | 'generator'
  | 'ammo_press'
  | 'auto_turret'
  | 'barricade'
  | 'repair_station'

export type ZombieKind = 'walker' | 'runner' | 'brute'

export type UpgradeCategory = 'weapon' | 'turret' | 'economy' | 'survival'

export type UpgradeRarity = 'common' | 'rare' | 'epic'

export interface ResourceMap {
  scrap: number
  power: number
  ammo: number
}

export interface Vec2 {
  x: number
  y: number
}

export interface Cell {
  x: number
  y: number
}

export interface RunState {
  phase: GamePhase
  waveIndex: number
  phaseTimeLeft: number
  playerHp: number
  coreHp: number
  resources: ResourceMap
  liveZpm: number
  peakZpm: number
  averageZpm: number
  selectedUpgradeIds: string[]
  totalKills: number
  elapsedTime: number
}

export interface StructureDef {
  label: string
  cost: number
  inputTypes: ResourceType[]
  outputTypes: ResourceType[]
  linkSlots: number
  placementRules: string
  powerRadius?: number
  ammoCapacity?: number
  maxHp: number
  color: string
}

export interface WaveDef {
  duration: number
  concurrentCap: number
  spawnMix: Record<ZombieKind, number>
  eliteChance: number
  scrapDropBudget: number
}

export interface UpgradeModifiers {
  playerDamageMultiplier: number
  playerFireRateMultiplier: number
  turretDamageMultiplier: number
  turretFireRateMultiplier: number
  generatorEfficiencyMultiplier: number
  ammoPressEfficiencyMultiplier: number
  salvageMultiplier: number
  playerMaxHpBonus: number
  coreMaxHpBonus: number
  rollCooldownMultiplier: number
  repairPowerEfficiencyMultiplier: number
}

export interface UpgradeDef {
  id: string
  label: string
  category: UpgradeCategory
  rarity: UpgradeRarity
  uiText: string
  apply: (runState: RunState, modifiers: UpgradeModifiers) => void
}

export interface InputState {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  firing: boolean
  aimPoint: Vec2
  rollQueued: boolean
  reloadQueued: boolean
}

export interface PlayerState {
  position: Vec2
  facing: number
  hp: number
  maxHp: number
  clipAmmo: number
  clipSize: number
  reserveAmmo: number
  fireCooldown: number
  reloadTimer: number
  rollCooldown: number
  rollTimer: number
  rollDirection: Vec2
  carriedScrap: number
}

export interface CoreState {
  cell: Cell
  hp: number
  maxHp: number
}

export interface StructureState {
  id: string
  kind: StructureKind
  cell: Cell
  hp: number
  maxHp: number
  stored: ResourceMap
  cooldown: number
  working: boolean
}

export interface LinkState {
  id: string
  fromId: string
  toId: string
}

export interface ZombieState {
  id: number
  kind: ZombieKind
  active: boolean
  position: Vec2
  hp: number
  maxHp: number
  speed: number
  attackDamage: number
  attackCooldown: number
  heading: number
  scrapValue: number
  hitFlash: number
}

export interface SalvageNodeState {
  id: string
  cell: Cell
  remaining: number
  harvestRate: number
}

export interface ScrapPickupState {
  id: number
  active: boolean
  position: Vec2
  amount: number
  ttl: number
}

export interface TracerState {
  id: number
  active: boolean
  start: Vec2
  end: Vec2
  ttl: number
}

export interface ZombieVisualState {
  id: number
  position: Vec2
  heading: number
  scale: number
  color: {
    r: number
    g: number
    b: number
  }
}

export interface PickupVisualState {
  id: number
  position: Vec2
  scale: number
}

export interface TracerVisualState {
  id: number
  start: Vec2
  end: Vec2
  alpha: number
}

export interface StructureSummary {
  id: string
  kind: StructureKind
  label: string
  hp: number
  stored: ResourceMap
  linkCount: number
}

export interface HudState {
  phase: GamePhase
  waveIndex: number
  phaseTimeLeft: number
  playerHp: number
  playerMaxHp: number
  coreHp: number
  coreMaxHp: number
  resources: ResourceMap
  liveZpm: number
  peakZpm: number
  averageZpm: number
  totalKills: number
  clipAmmo: number
  reserveAmmo: number
  selectedBuildKind: StructureKind | null
  linkMode: boolean
  linkSourceId: string | null
  notification: string
  pendingUpgrades: UpgradeDef[]
  selectedUpgradeIds: string[]
  structureSummaries: StructureSummary[]
  totalStructures: number
  initialBuild: boolean
}
