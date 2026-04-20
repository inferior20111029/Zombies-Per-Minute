import type {
  Cell,
  StructureDef,
  StructureKind,
  UpgradeDef,
  UpgradeModifiers,
  WaveDef,
} from './types.ts'

export const GRID_SIZE = 19
export const CELL_SIZE = 2.4
export const WORLD_HALF_EXTENT = (GRID_SIZE * CELL_SIZE) / 2
export const MAX_ZOMBIES = 140
export const MAX_PICKUPS = 56
export const MAX_TRACERS = 18
export const MAX_WAVES = 5
export const INITIAL_BUILD_TIME = 35
export const BUILD_PHASE_TIME = 30
export const MAX_LINK_DISTANCE = 10.5
export const BASE_PLAYER_HP = 140
export const BASE_CORE_HP = 520
export const STARTING_SCRAP = 260
export const STARTING_RESERVE_AMMO = 120
export const PLAYER_CLIP_SIZE = 30
export const BASE_PLAYER_SPEED = 6.4
export const BASE_PLAYER_ROLL_SPEED = 14
export const BASE_PLAYER_ROLL_TIME = 0.26
export const BASE_PLAYER_ROLL_COOLDOWN = 2.2
export const BASE_RIFLE_DAMAGE = 18
export const BASE_RIFLE_FIRE_INTERVAL = 0.12
export const BASE_RELOAD_TIME = 1.1

export const CORE_CELL: Cell = {
  x: Math.floor(GRID_SIZE / 2),
  y: Math.floor(GRID_SIZE / 2),
}

export const SCRAP_DEPOT_START_CELL: Cell = {
  x: CORE_CELL.x,
  y: CORE_CELL.y + 2,
}

export const SPAWN_CELLS: Cell[] = [
  { x: CORE_CELL.x, y: 0 },
  { x: 1, y: GRID_SIZE - 3 },
  { x: GRID_SIZE - 2, y: GRID_SIZE - 3 },
]

export const SALVAGE_CELLS: Cell[] = [
  { x: 3, y: 3 },
  { x: GRID_SIZE - 4, y: 4 },
  { x: 2, y: GRID_SIZE - 6 },
  { x: GRID_SIZE - 3, y: GRID_SIZE - 6 },
  { x: CORE_CELL.x, y: GRID_SIZE - 2 },
]

export const STRUCTURE_BUILD_ORDER: StructureKind[] = [
  'scrap_depot',
  'generator',
  'ammo_press',
  'auto_turret',
  'barricade',
  'repair_station',
]

export const STRUCTURE_DEFS: Record<StructureKind, StructureDef> = {
  scrap_depot: {
    label: '廢料倉',
    cost: 35,
    inputTypes: [],
    outputTypes: ['scrap'],
    linkSlots: 3,
    placementRules: '不能與核心、出生口、回收堆或其他建築重疊。',
    maxHp: 180,
    color: '#e0a96d',
  },
  generator: {
    label: '發電機',
    cost: 60,
    inputTypes: ['scrap'],
    outputTypes: ['power'],
    linkSlots: 4,
    placementRules: '需要接到廢料倉，並保留一些周圍空間。',
    powerRadius: 0,
    maxHp: 220,
    color: '#63b3ff',
  },
  ammo_press: {
    label: '彈藥壓製機',
    cost: 75,
    inputTypes: ['scrap', 'power'],
    outputTypes: ['ammo'],
    linkSlots: 3,
    placementRules: '需要一條來自廢料倉與一條來自發電機的連線。',
    ammoCapacity: 140,
    maxHp: 200,
    color: '#d468ff',
  },
  auto_turret: {
    label: '自動砲塔',
    cost: 90,
    inputTypes: ['ammo', 'power'],
    outputTypes: [],
    linkSlots: 0,
    placementRules: '需要一條來自彈藥壓製機與一條來自發電機的連線。',
    powerRadius: 8.2,
    maxHp: 150,
    color: '#53f2a7',
  },
  barricade: {
    label: '路障',
    cost: 40,
    inputTypes: [],
    outputTypes: [],
    linkSlots: 0,
    placementRules: '會佔據格位，拖慢或阻擋該路線上的殭屍。',
    maxHp: 320,
    color: '#b88f6a',
  },
  repair_station: {
    label: '維修站',
    cost: 65,
    inputTypes: ['power'],
    outputTypes: [],
    linkSlots: 0,
    placementRules: '需要一條來自發電機的連線，放在核心或瓶頸附近效果最好。',
    powerRadius: 6,
    maxHp: 185,
    color: '#8cffdf',
  },
}

export const TARGET_LINK_RULES: Record<StructureKind, StructureKind[]> = {
  scrap_depot: [],
  generator: ['scrap_depot'],
  ammo_press: ['scrap_depot', 'generator'],
  auto_turret: ['ammo_press', 'generator'],
  barricade: [],
  repair_station: ['generator'],
}

export const WAVE_DEFS: WaveDef[] = [
  {
    duration: 90,
    concurrentCap: 80,
    spawnMix: { walker: 0.84, runner: 0.16, brute: 0 },
    eliteChance: 0,
    scrapDropBudget: 1,
  },
  {
    duration: 90,
    concurrentCap: 92,
    spawnMix: { walker: 0.72, runner: 0.24, brute: 0.04 },
    eliteChance: 0.04,
    scrapDropBudget: 1.1,
  },
  {
    duration: 90,
    concurrentCap: 104,
    spawnMix: { walker: 0.64, runner: 0.28, brute: 0.08 },
    eliteChance: 0.07,
    scrapDropBudget: 1.16,
  },
  {
    duration: 90,
    concurrentCap: 116,
    spawnMix: { walker: 0.56, runner: 0.29, brute: 0.15 },
    eliteChance: 0.11,
    scrapDropBudget: 1.22,
  },
  {
    duration: 90,
    concurrentCap: 124,
    spawnMix: { walker: 0.48, runner: 0.3, brute: 0.22 },
    eliteChance: 0.16,
    scrapDropBudget: 1.28,
  },
]

export const BASE_UPGRADE_MODIFIERS: UpgradeModifiers = {
  playerDamageMultiplier: 1,
  playerFireRateMultiplier: 1,
  turretDamageMultiplier: 1,
  turretFireRateMultiplier: 1,
  generatorEfficiencyMultiplier: 1,
  ammoPressEfficiencyMultiplier: 1,
  salvageMultiplier: 1,
  playerMaxHpBonus: 0,
  coreMaxHpBonus: 0,
  rollCooldownMultiplier: 1,
  repairPowerEfficiencyMultiplier: 1,
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    id: 'weapon-rifling',
    label: '膛線槍機',
    category: 'weapon',
    rarity: 'common',
    uiText: '步槍傷害 +20%。',
    apply: (_, modifiers) => {
      modifiers.playerDamageMultiplier *= 1.2
    },
  },
  {
    id: 'weapon-cyclic',
    label: '循環爆發套件',
    category: 'weapon',
    rarity: 'rare',
    uiText: '步槍射速 +18%。',
    apply: (_, modifiers) => {
      modifiers.playerFireRateMultiplier *= 1.18
    },
  },
  {
    id: 'turret-sabot',
    label: '脫殼彈鏈',
    category: 'turret',
    rarity: 'rare',
    uiText: '砲塔傷害 +25%。',
    apply: (_, modifiers) => {
      modifiers.turretDamageMultiplier *= 1.25
    },
  },
  {
    id: 'turret-autoloader',
    label: '自動裝填導軌',
    category: 'turret',
    rarity: 'epic',
    uiText: '砲塔射速 +30%。',
    apply: (_, modifiers) => {
      modifiers.turretFireRateMultiplier *= 1.3
    },
  },
  {
    id: 'economy-grid',
    label: '電網電容',
    category: 'economy',
    rarity: 'rare',
    uiText: '發電機輸出 +35%。',
    apply: (_, modifiers) => {
      modifiers.generatorEfficiencyMultiplier *= 1.35
    },
  },
  {
    id: 'economy-press',
    label: '沖壓升級',
    category: 'economy',
    rarity: 'common',
    uiText: '彈藥壓製機產能 +28%。',
    apply: (_, modifiers) => {
      modifiers.ammoPressEfficiencyMultiplier *= 1.28
    },
  },
  {
    id: 'economy-recycler',
    label: '回收無人機',
    category: 'economy',
    rarity: 'common',
    uiText: '野外廢料採集 +25%。',
    apply: (_, modifiers) => {
      modifiers.salvageMultiplier *= 1.25
    },
  },
  {
    id: 'survival-armor',
    label: '反應式裝甲',
    category: 'survival',
    rarity: 'common',
    uiText: '玩家最大生命 +30，並回復 30。',
    apply: (runState, modifiers) => {
      modifiers.playerMaxHpBonus += 30
      runState.playerHp += 30
    },
  },
  {
    id: 'survival-bastion',
    label: '堡壘艙壁',
    category: 'survival',
    rarity: 'rare',
    uiText: '核心最大生命 +80，並回復 80。',
    apply: (runState, modifiers) => {
      modifiers.coreMaxHpBonus += 80
      runState.coreHp += 80
    },
  },
  {
    id: 'survival-mobility',
    label: '伺服護脛',
    category: 'survival',
    rarity: 'common',
    uiText: '翻滾冷卻 -18%。',
    apply: (_, modifiers) => {
      modifiers.rollCooldownMultiplier *= 0.82
    },
  },
  {
    id: 'survival-nanites',
    label: '維修奈米機',
    category: 'survival',
    rarity: 'rare',
    uiText: '維修站效率 +30%。',
    apply: (_, modifiers) => {
      modifiers.repairPowerEfficiencyMultiplier *= 1.3
    },
  },
]
