import * as THREE from '/node_modules/three/build/three.module.js'

const canvas = document.querySelector('#scene')
const menu = document.querySelector('#menu')
const hud = document.querySelector('#hud')
const buildPanel = document.querySelector('#build-panel')
const upgradePanel = document.querySelector('#upgrade-panel')
const summaryPanel = document.querySelector('#summary-panel')
const controlsRibbon = document.querySelector('#controls-ribbon')
const phaseBanner = document.querySelector('#phase-banner')
const startButton = document.querySelector('#start-button')
const restartButton = document.querySelector('#restart-button')
const menuButton = document.querySelector('#menu-button')
const linkButton = document.querySelector('#link-button')
const buildList = document.querySelector('#build-list')
const networkList = document.querySelector('#network-list')
const upgradeList = document.querySelector('#upgrade-list')
const summaryGrid = document.querySelector('#summary-grid')

const refs = {
  wave: document.querySelector('#wave-value'),
  phase: document.querySelector('#phase-label'),
  timer: document.querySelector('#timer-value'),
  liveZpm: document.querySelector('#live-zpm'),
  peakZpm: document.querySelector('#peak-zpm'),
  playerHp: document.querySelector('#player-hp'),
  coreHp: document.querySelector('#core-hp'),
  ammoHud: document.querySelector('#ammo-hud'),
  killHud: document.querySelector('#kill-hud'),
  scrap: document.querySelector('#scrap-value'),
  power: document.querySelector('#power-value'),
  ammo: document.querySelector('#ammo-value'),
  average: document.querySelector('#average-zpm'),
  note: document.querySelector('#notification'),
  buildTitle: document.querySelector('#build-title'),
  upgradeTitle: document.querySelector('#upgrade-title'),
  summaryTitle: document.querySelector('#summary-title'),
  summaryCopy: document.querySelector('#summary-copy'),
}

const WORLD_HALF = 30
const GRID_SIZE = 2.5
const INITIAL_BUILD_SECONDS = 35
const BUILD_SECONDS = 25
const ASSAULT_SECONDS = 45
const MAX_WAVES = 5
const LINK_DISTANCE = 11.5
const PLAYER_CLIP_SIZE = 30
const STARTING_SCRAP = 135
const STARTING_RESERVE_AMMO = 120
const PLAYER_BASE_HP = 140
const CORE_BASE_HP = 520

const input = { forward: false, back: false, left: false, right: false, firing: false }
const pointer = { ndcX: 0, ndcY: 0, worldX: 0, worldZ: 0 }

const structureDefs = {
  scrap_depot: { label: '廢料倉', cost: 25, color: '#d8a06a', hp: 180, inputs: [], linkSlots: 4, range: 0, copy: '收納回收金屬，供應整條生產線。' },
  generator: { label: '發電機', cost: 35, color: '#67b7ff', hp: 220, inputs: ['scrap_depot'], linkSlots: 4, range: 0, copy: '把廢料轉成穩定電力。' },
  ammo_press: { label: '彈藥機', cost: 45, color: '#cf6dff', hp: 200, inputs: ['scrap_depot', 'generator'], linkSlots: 3, range: 0, copy: '消耗廢料與電力，壓製砲塔彈藥。' },
  auto_turret: { label: '自動砲塔', cost: 60, color: '#53f2a7', hp: 150, inputs: ['ammo_press', 'generator'], linkSlots: 0, range: 12.5, copy: '接通後會自動鎖定並射擊。' },
  barricade: { label: '路障', cost: 20, color: '#b78f66', hp: 320, inputs: [], linkSlots: 0, range: 0, copy: '拖慢屍潮，保護主線與核心。' },
  repair_station: { label: '維修站', cost: 40, color: '#89ffe1', hp: 185, inputs: ['generator'], linkSlots: 0, range: 8, copy: '消耗電力修復建築與核心。' },
}

const buildOrder = ['scrap_depot', 'generator', 'ammo_press', 'auto_turret', 'barricade', 'repair_station']
const waveDefs = [
  { cap: 16, every: 1.05, mix: { walker: 0.88, runner: 0.12, brute: 0 } },
  { cap: 20, every: 0.9, mix: { walker: 0.75, runner: 0.22, brute: 0.03 } },
  { cap: 24, every: 0.78, mix: { walker: 0.64, runner: 0.27, brute: 0.09 } },
  { cap: 28, every: 0.67, mix: { walker: 0.55, runner: 0.28, brute: 0.17 } },
  { cap: 32, every: 0.6, mix: { walker: 0.48, runner: 0.28, brute: 0.24 } },
]

const upgrades = [
  { id: 'weapon-rifling', label: '膛線強化', category: '武器', rarity: '普通', uiText: '玩家子彈傷害 +20%', apply: (state) => { state.modifiers.playerDamage *= 1.2 } },
  { id: 'weapon-cyclic', label: '循環套件', category: '武器', rarity: '稀有', uiText: '玩家射速 +18%', apply: (state) => { state.modifiers.playerFireRate *= 1.18 } },
  { id: 'economy-grid', label: '電網電容', category: '經濟', rarity: '稀有', uiText: '發電機輸出 +35%', apply: (state) => { state.modifiers.generatorEfficiency *= 1.35 } },
  { id: 'economy-press', label: '壓製升級', category: '經濟', rarity: '普通', uiText: '彈藥機產量 +28%', apply: (state) => { state.modifiers.ammoEfficiency *= 1.28 } },
  { id: 'economy-recycler', label: '回收無人機', category: '經濟', rarity: '普通', uiText: '野外廢料收益 +25%', apply: (state) => { state.modifiers.salvageYield *= 1.25 } },
  { id: 'survival-exoshell', label: '反應外骨骼', category: '生存', rarity: '稀有', uiText: '玩家最大生命 +25', apply: (state) => { state.player.maxHp += 25; state.player.hp += 25 } },
  { id: 'survival-bulkheads', label: '核心隔艙', category: '生存', rarity: '史詩', uiText: '核心最大生命 +80', apply: (state) => { state.core.maxHp += 80; state.core.hp += 80 } },
  { id: 'survival-thrusters', label: '翻滾噴推', category: '生存', rarity: '普通', uiText: '翻滾冷卻 -18%', apply: (state) => { state.modifiers.rollCooldown *= 0.82 } },
  { id: 'turret-sabot', label: '穿甲供彈', category: '砲塔', rarity: '稀有', uiText: '砲塔傷害 +25%', apply: (state) => { state.modifiers.turretDamage *= 1.25 } },
  { id: 'turret-autoloader', label: '自動裝填軌', category: '砲塔', rarity: '史詩', uiText: '砲塔射速 +30%', apply: (state) => { state.modifiers.turretFireRate *= 1.3 } },
  { id: 'support-welders', label: '場地焊接隊', category: '生存', rarity: '稀有', uiText: '維修站耗電 -20%', apply: (state) => { state.modifiers.repairEfficiency *= 1.2 } },
]

const spawnPoints = [new THREE.Vector3(0, 0, -26), new THREE.Vector3(-22, 0, 22), new THREE.Vector3(22, 0, 22)]
const salvageSpots = [{ x: -18, z: -14 }, { x: 18, z: -11 }, { x: -22, z: 17 }, { x: 21, z: 15 }, { x: 0, z: 24 }]

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.background = new THREE.Color('#100c0a')
scene.fog = new THREE.Fog('#100c0a', 22, 72)

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 160)
camera.position.set(0, 10, 16)

const raycaster = new THREE.Raycaster()
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const aimHit = new THREE.Vector3()
const desiredCamera = new THREE.Vector3()
const cameraLook = new THREE.Vector3()

const worldGroup = new THREE.Group()
const salvageGroup = new THREE.Group()
const structureGroup = new THREE.Group()
const linkGroup = new THREE.Group()
const zombieGroup = new THREE.Group()
const pickupGroup = new THREE.Group()
const tracerGroup = new THREE.Group()
scene.add(worldGroup, salvageGroup, structureGroup, linkGroup, zombieGroup, pickupGroup, tracerGroup)

const gridHelper = new THREE.GridHelper(WORLD_HALF * 2, (WORLD_HALF * 2) / GRID_SIZE, '#26433b', '#1c2420')
gridHelper.position.y = 0.02
scene.add(gridHelper)

const ambient = new THREE.HemisphereLight('#ffd6be', '#211510', 0.9)
const fill = new THREE.PointLight('#6ad5ff', 0.85, 48)
fill.position.set(-14, 8, 10)
const sun = new THREE.DirectionalLight('#ffd7b8', 2)
sun.position.set(14, 18, 10)
sun.castShadow = true
sun.shadow.mapSize.setScalar(2048)
sun.shadow.camera.left = -36
sun.shadow.camera.right = 36
sun.shadow.camera.top = 36
sun.shadow.camera.bottom = -36
scene.add(ambient, fill, sun)

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD_HALF * 2.7, WORLD_HALF * 2.7),
  new THREE.MeshStandardMaterial({ color: '#161110', roughness: 0.95, metalness: 0.02 }),
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

const coreGroup = new THREE.Group()
const coreBase = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 3.1, 2, 12),
  new THREE.MeshStandardMaterial({ color: '#4a372d', roughness: 0.72, metalness: 0.28 }),
)
coreBase.castShadow = true
coreBase.receiveShadow = true
const coreCrystal = new THREE.Mesh(
  new THREE.OctahedronGeometry(1.25, 0),
  new THREE.MeshStandardMaterial({ color: '#ff965b', emissive: '#ff7f48', emissiveIntensity: 1.2, roughness: 0.16 }),
)
coreCrystal.position.y = 2
coreCrystal.castShadow = true
coreGroup.add(coreBase, coreCrystal)
scene.add(coreGroup)

const playerGroup = new THREE.Group()
const playerBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.55, 1.4, 6, 12),
  new THREE.MeshStandardMaterial({ color: '#efe3d8', roughness: 0.24, metalness: 0.08 }),
)
playerBody.position.y = 1.4
playerBody.castShadow = true
const playerGun = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.18, 1.25),
  new THREE.MeshStandardMaterial({ color: '#131313', roughness: 0.3, metalness: 0.8 }),
)
playerGun.position.set(0.42, 1.45, 0.55)
playerGun.castShadow = true
playerGroup.add(playerBody, playerGun)
scene.add(playerGroup)

const placementGhost = new THREE.Mesh(
  new THREE.RingGeometry(0.75, 1.2, 24),
  new THREE.MeshStandardMaterial({ color: '#63ffbf', emissive: '#63ffbf', emissiveIntensity: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
)
placementGhost.rotation.x = -Math.PI / 2
placementGhost.visible = false
scene.add(placementGhost)

const staticPulseObjects = []
let state = null
let ids = { structure: 0, link: 0, zombie: 0, pickup: 0, tracer: 0 }
let bannerTimeout = 0
let uiAccumulator = 0

function createState() {
  return {
    phase: 'menu', summaryMode: 'victory', wave: 1, phaseTimeLeft: INITIAL_BUILD_SECONDS, elapsedTime: 0,
    selectedBuild: 'generator', linkMode: false, linkSourceId: null, lastNote: '先把第一條生產線搭起來，再迎接第一波屍潮。',
    player: { x: 0, z: 9, hp: PLAYER_BASE_HP, maxHp: PLAYER_BASE_HP, angle: -Math.PI, clipAmmo: PLAYER_CLIP_SIZE, reserveAmmo: STARTING_RESERVE_AMMO, fireCooldown: 0, reloadTimer: 0, rollCooldown: 0, rollTimer: 0, rollX: 0, rollZ: -1 },
    core: { hp: CORE_BASE_HP, maxHp: CORE_BASE_HP },
    resources: { scrap: STARTING_SCRAP, power: 0, ammo: 0 },
    totalKills: 0, liveZpm: 0, peakZpm: 0, averageZpm: 0, killTimes: [], selectedUpgradeIds: [], pendingUpgrades: [],
    modifiers: { playerDamage: 1, playerFireRate: 1, turretDamage: 1, turretFireRate: 1, generatorEfficiency: 1, ammoEfficiency: 1, salvageYield: 1, rollCooldown: 1, repairEfficiency: 1 },
    structures: [], links: [], zombies: [], pickups: [], tracers: [], salvageNodes: [], spawnTimer: 0, factoryTimer: 0,
  }
}

function clamp(value, min, max) { return Math.min(Math.max(value, min), max) }
function distance2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz) }
function snapToGrid(value) { return Math.round(value / GRID_SIZE) * GRID_SIZE }
function formatTime(seconds) { const whole = Math.max(0, Math.ceil(seconds)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}` }
function clearGroup(group) { while (group.children.length > 0) { group.remove(group.children[group.children.length - 1]) } }
function findStructure(id) { return state.structures.find((structure) => structure.id === id) || null }
function incomingKinds(structureId) { return state.links.filter((link) => link.toId === structureId).map((link) => findStructure(link.fromId)).filter(Boolean).map((structure) => structure.kind) }
function hasInput(structure, inputKind) { return incomingKinds(structure.id).includes(inputKind) }
function operational(structure) { return structureDefs[structure.kind].inputs.every((inputKind) => hasInput(structure, inputKind)) }
function outgoingCount(structureId) { return state.links.filter((link) => link.fromId === structureId).length }
function setNotification(message) { state.lastNote = message; refs.note.textContent = message }
function showBanner(message) { clearTimeout(bannerTimeout); phaseBanner.textContent = message; phaseBanner.classList.remove('hidden'); bannerTimeout = window.setTimeout(() => phaseBanner.classList.add('hidden'), 1800) }
function createLine(from, to, color) { const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]); return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })) }
function makeWorld() {
  clearGroup(worldGroup)
  staticPulseObjects.length = 0
  for (let index = 0; index < 34; index += 1) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + Math.random() * 1.6, 0.6 + Math.random() * 2.1, 0.8 + Math.random() * 1.5),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.055, 0.28, 0.14 + Math.random() * 0.08), roughness: 0.95, metalness: 0.04 }),
    )
    block.position.set((Math.random() - 0.5) * WORLD_HALF * 2.2, 0.35 + Math.random() * 1.1, (Math.random() - 0.5) * WORLD_HALF * 2.2)
    if (block.position.length() < 9) block.position.multiplyScalar(1.7)
    block.rotation.set(Math.random(), Math.random() * Math.PI, Math.random())
    block.castShadow = true
    block.receiveShadow = true
    worldGroup.add(block)
  }
  spawnPoints.forEach((point, index) => {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.68, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: '#ff754e', emissive: '#ff754e', emissiveIntensity: 1.1, roughness: 0.35 }),
    )
    beacon.position.copy(point)
    beacon.position.y = 1.4
    beacon.castShadow = true
    worldGroup.add(beacon)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.08, 10, 24),
      new THREE.MeshStandardMaterial({ color: '#ff9d6f', emissive: '#ff9d6f', emissiveIntensity: 1.2, roughness: 0.24 }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.copy(point)
    ring.position.y = 0.14
    ring.userData.offset = index * 0.7
    worldGroup.add(ring)
    staticPulseObjects.push(ring)
  })
}

function createSalvageMesh() {
  const group = new THREE.Group()
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#5a4031', roughness: 0.94 }))
  base.position.y = 0.55
  base.castShadow = true
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.82, 0),
    new THREE.MeshStandardMaterial({ color: '#ffc578', emissive: '#ff9f47', emissiveIntensity: 1.1, roughness: 0.18 }),
  )
  crystal.position.y = 1.5
  crystal.castShadow = true
  group.add(base, crystal)
  group.userData.crystal = crystal
  return group
}

function createStructureMesh(kind) {
  const baseMaterial = new THREE.MeshStandardMaterial({ color: structureDefs[kind].color, roughness: 0.38, metalness: 0.2, emissive: structureDefs[kind].color, emissiveIntensity: 0.15 })
  const group = new THREE.Group()
  if (kind === 'scrap_depot') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.4), baseMaterial)
    base.position.y = 0.55
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 1.15), new THREE.MeshStandardMaterial({ color: '#3b2a20', roughness: 0.92 }))
    stack.position.y = 1.55
    group.add(base, stack)
  } else if (kind === 'generator') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 1.85, 10), baseMaterial)
    body.position.y = 0.92
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.18, 10, 28), new THREE.MeshStandardMaterial({ color: '#dff8ff', emissive: '#7cd6ff', emissiveIntensity: 1.4, roughness: 0.22 }))
    coil.position.y = 1.8
    coil.rotation.x = Math.PI / 2
    group.add(body, coil)
  } else if (kind === 'ammo_press') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.55, 1.9), baseMaterial)
    body.position.y = 0.78
    const press = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffe6ff', emissive: '#cf72ff', emissiveIntensity: 0.9, roughness: 0.2 }))
    press.position.y = 1.85
    group.add(body, press)
  } else if (kind === 'auto_turret') {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.56, 1.55, 8), baseMaterial)
    stand.position.y = 0.77
    const head = new THREE.Mesh(new THREE.BoxGeometry(1, 0.42, 1.15), new THREE.MeshStandardMaterial({ color: '#e8fff4', roughness: 0.18, metalness: 0.12 }))
    head.position.y = 1.72
    head.name = 'head'
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.12, 6), new THREE.MeshStandardMaterial({ color: '#091014', roughness: 0.26, metalness: 0.85 }))
    barrel.position.set(0, 1.72, 0.84)
    barrel.rotation.x = Math.PI / 2
    barrel.name = 'barrel'
    group.add(stand, head, barrel)
  } else if (kind === 'barricade') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.15, 0.82), baseMaterial)
    wall.position.y = 0.58
    group.add(wall)
  } else {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 1.3, 8), baseMaterial)
    base.position.y = 0.65
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), new THREE.MeshStandardMaterial({ color: '#e9fff8', emissive: '#6cffd8', emissiveIntensity: 1.2, roughness: 0.2 }))
    crystal.position.y = 1.82
    group.add(base, crystal)
  }
  group.traverse((child) => {
    child.castShadow = true
    child.receiveShadow = true
    if (child.material && 'emissiveIntensity' in child.material) child.userData.baseEmissiveIntensity = child.material.emissiveIntensity
  })
  return group
}

function createZombieMesh(kind) {
  const group = new THREE.Group()
  if (kind === 'walker') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.35, 4, 8), new THREE.MeshStandardMaterial({ color: '#b1c56d', emissive: '#2d381a', emissiveIntensity: 0.35, roughness: 0.82 }))
    body.position.y = 1.2
    group.add(body)
  } else if (kind === 'runner') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 12), new THREE.MeshStandardMaterial({ color: '#ffc064', emissive: '#6b3819', emissiveIntensity: 0.34, roughness: 0.62 }))
    body.position.y = 1
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 6), new THREE.MeshStandardMaterial({ color: '#8d5028', roughness: 0.74 }))
    tail.position.set(0, 0.72, -0.5)
    tail.rotation.x = Math.PI / 2
    group.add(body, tail)
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.15, 1.35), new THREE.MeshStandardMaterial({ color: '#ff7b61', emissive: '#652016', emissiveIntensity: 0.45, roughness: 0.6 }))
    body.position.y = 1.08
    group.add(body)
  }
  group.traverse((child) => {
    child.castShadow = true
    child.receiveShadow = true
    if (child.material && 'emissiveIntensity' in child.material) child.userData.baseEmissiveIntensity = child.material.emissiveIntensity
  })
  return group
}

function createPickupMesh(amount) {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(amount >= 6 ? 0.42 : 0.32, 0), new THREE.MeshStandardMaterial({ color: '#ffd67d', emissive: '#ffb24e', emissiveIntensity: 1.1, roughness: 0.18 }))
  mesh.castShadow = true
  return mesh
}

function structureStatus(structure) {
  if (structure.kind === 'scrap_depot' || structure.kind === 'barricade') return '在線'
  if (!operational(structure)) return '缺少連線'
  if (structure.kind === 'generator') return state.resources.scrap > 0 ? '供電中' : '等待廢料'
  if (structure.kind === 'ammo_press') return state.resources.scrap <= 0 ? '等待廢料' : state.resources.power <= 0.5 ? '等待電力' : '生產彈藥'
  if (structure.kind === 'auto_turret') return state.resources.ammo <= 0 ? '等待彈藥' : state.resources.power <= 0.2 ? '等待電力' : '索敵中'
  return state.resources.power > 0.5 ? '待命維修' : '等待電力'
}

function rebuildBuildList() {
  buildList.innerHTML = buildOrder.map((kind, index) => {
    const def = structureDefs[kind]
    const selected = state.selectedBuild === kind ? 'selected' : ''
    const dimmed = state.resources.scrap < def.cost ? 'opacity: 0.55;' : ''
    return `
      <button class="build-card ${selected}" data-kind="${kind}" style="${dimmed}">
        <div class="build-card-top"><span class="hotkey">${index + 1}</span><strong>${def.label}</strong><span>${def.cost} 廢料</span></div>
        <div class="build-copy">${def.copy}</div>
      </button>`
  }).join('')
  buildList.querySelectorAll('[data-kind]').forEach((element) => {
    element.addEventListener('click', () => {
      if (state.phase !== 'build') return
      state.selectedBuild = element.dataset.kind
      rebuildBuildList()
    })
  })
}

function rebuildNetworkList() {
  networkList.innerHTML = state.structures.map((structure) => {
    const source = state.linkSourceId === structure.id ? ' · 來源已選' : ''
    return `<div class="network-row"><strong>${structureDefs[structure.kind].label}${source}</strong><span>${structureStatus(structure)}</span></div>`
  }).join('') || '<div class="network-row"><strong>尚無建築</strong><span>先放置建築</span></div>'
}

function rebuildUpgradeList() {
  upgradeList.innerHTML = state.pendingUpgrades.map((upgrade) => `
    <button class="upgrade-card" data-upgrade="${upgrade.id}">
      <div class="upgrade-category">${upgrade.category}</div><h3>${upgrade.label}</h3><div class="upgrade-rare">${upgrade.rarity}</div><p class="upgrade-copy">${upgrade.uiText}</p>
    </button>`).join('')
  upgradeList.querySelectorAll('[data-upgrade]').forEach((element) => {
    element.addEventListener('click', () => {
      const picked = state.pendingUpgrades.find((upgrade) => upgrade.id === element.dataset.upgrade)
      if (!picked) return
      picked.apply(state)
      state.selectedUpgradeIds.push(picked.id)
      state.pendingUpgrades = []
      if (state.wave >= MAX_WAVES) finishRun('victory')
      else { state.wave += 1; enterBuildPhase(false) }
      updateHud()
    })
  })
}

function updateHud() {
  const phaseLabels = { menu: '主選單', build: '建造階段', assault: '防守階段', upgrade: '升級選擇', summary: '結算', game_over: '失敗' }
  refs.wave.textContent = String(state.wave)
  refs.phase.textContent = phaseLabels[state.phase]
  refs.timer.textContent = formatTime(state.phaseTimeLeft)
  refs.liveZpm.textContent = state.liveZpm.toFixed(1)
  refs.peakZpm.textContent = state.peakZpm.toFixed(1)
  refs.playerHp.textContent = `${Math.max(0, Math.round(state.player.hp))} / ${Math.round(state.player.maxHp)}`
  refs.coreHp.textContent = `${Math.max(0, Math.round(state.core.hp))} / ${Math.round(state.core.maxHp)}`
  refs.ammoHud.textContent = `${state.player.clipAmmo} / ${state.player.reserveAmmo}`
  refs.killHud.textContent = String(state.totalKills)
  refs.scrap.textContent = String(Math.round(state.resources.scrap))
  refs.power.textContent = state.resources.power.toFixed(0)
  refs.ammo.textContent = state.resources.ammo.toFixed(0)
  refs.average.textContent = state.averageZpm.toFixed(1)
  refs.note.textContent = state.lastNote
  menu.classList.toggle('hidden', state.phase !== 'menu')
  hud.classList.toggle('hidden', state.phase === 'menu')
  buildPanel.classList.toggle('hidden', state.phase !== 'build')
  upgradePanel.classList.toggle('hidden', state.phase !== 'upgrade')
  summaryPanel.classList.toggle('hidden', state.phase !== 'summary' && state.phase !== 'game_over')
  controlsRibbon.classList.toggle('hidden', state.phase === 'menu')
  gridHelper.visible = state.phase === 'build'
  linkButton.classList.toggle('active', state.linkMode)
  linkButton.textContent = state.linkMode ? '連線模式：開' : '連線模式：關'
}

function rebuildLinks() {
  clearGroup(linkGroup)
  state.links.forEach((link) => {
    const from = findStructure(link.fromId)
    const to = findStructure(link.toId)
    if (!from || !to) return
    linkGroup.add(createLine({ x: from.x, y: 1.15, z: from.z }, { x: to.x, y: 1.15, z: to.z }, '#7ce5ff'))
  })
}

function refreshStructureVisual(structure) {
  const ratio = clamp(structure.hp / structure.maxHp, 0, 1)
  structure.mesh.traverse((child) => {
    if (child.material && 'emissiveIntensity' in child.material) {
      const base = child.userData.baseEmissiveIntensity ?? 0.15
      child.material.emissiveIntensity = base * (structure.working ? 1.8 : 1) * ratio
    }
  })
}

function createStructure(kind, x, z) {
  const id = `s${++ids.structure}`
  const mesh = createStructureMesh(kind)
  mesh.position.set(x, 0, z)
  mesh.traverse((child) => { child.userData.structureId = id })
  structureGroup.add(mesh)
  const structure = { id, kind, x, z, hp: structureDefs[kind].hp, maxHp: structureDefs[kind].hp, cooldown: Math.random() * 0.2, mesh, working: false }
  state.structures.push(structure)
  refreshStructureVisual(structure)
  rebuildNetworkList()
  return structure
}

function removeStructure(structure) {
  structureGroup.remove(structure.mesh)
  state.structures = state.structures.filter((entry) => entry.id !== structure.id)
  state.links = state.links.filter((link) => link.fromId !== structure.id && link.toId !== structure.id)
  if (state.linkSourceId === structure.id) state.linkSourceId = null
  rebuildLinks()
  rebuildNetworkList()
}

function createSalvageNode(x, z) {
  const mesh = createSalvageMesh()
  mesh.position.set(x, 0, z)
  salvageGroup.add(mesh)
  state.salvageNodes.push({ id: `salvage-${x}-${z}`, x, z, charges: 5, cooldown: 0, mesh })
}

function createZombie(kind, x, z) {
  const mesh = createZombieMesh(kind)
  mesh.position.set(x, 0, z)
  zombieGroup.add(mesh)
  const zombie = { id: `z${++ids.zombie}`, kind, x, z, hp: kind === 'brute' ? 82 : kind === 'runner' ? 26 : 38, maxHp: kind === 'brute' ? 82 : kind === 'runner' ? 26 : 38, speed: kind === 'brute' ? 2.2 : kind === 'runner' ? 5.6 : 3.4, damage: kind === 'brute' ? 17 : kind === 'runner' ? 8 : 10, cooldown: Math.random() * 0.6, hitFlash: 0, mesh }
  state.zombies.push(zombie)
  return zombie
}

function removeZombie(zombie) { zombieGroup.remove(zombie.mesh); state.zombies = state.zombies.filter((entry) => entry.id !== zombie.id) }
function createPickup(x, z, amount) { const mesh = createPickupMesh(amount); mesh.position.set(x, 0.65, z); pickupGroup.add(mesh); state.pickups.push({ id: `p${++ids.pickup}`, x, z, amount, ttl: 18, bob: Math.random() * Math.PI * 2, mesh }) }
function createTracer(from, to, color) { const visual = createLine(from, to, color); tracerGroup.add(visual); state.tracers.push({ id: `t${++ids.tracer}`, ttl: 0.12, visual }) }
function refreshCoreVisual(time) {
  const ratio = clamp(state.core.hp / state.core.maxHp, 0, 1)
  coreCrystal.material.color = new THREE.Color().lerpColors(new THREE.Color('#ff5440'), new THREE.Color('#ff9b5e'), ratio)
  coreCrystal.material.emissiveIntensity = 0.45 + ratio * 1.15 + Math.sin(time * 2.8) * 0.08
}

function refreshPlayerVisual() {
  const ratio = clamp(state.player.hp / state.player.maxHp, 0, 1)
  playerBody.material.color = new THREE.Color().lerpColors(new THREE.Color('#f16663'), new THREE.Color('#efe3d8'), ratio)
  playerBody.material.emissive = state.player.rollTimer > 0 ? new THREE.Color('#78e7ff') : new THREE.Color('#3b241c')
  playerBody.material.emissiveIntensity = state.player.rollTimer > 0 ? 1.05 : 0.18
}

function resetRunWorld() {
  clearGroup(salvageGroup)
  clearGroup(structureGroup)
  clearGroup(linkGroup)
  clearGroup(zombieGroup)
  clearGroup(pickupGroup)
  clearGroup(tracerGroup)
  ids = { structure: 0, link: 0, zombie: 0, pickup: 0, tracer: 0 }
  state = createState()
  salvageSpots.forEach((spot) => createSalvageNode(spot.x, spot.z))
  createStructure('scrap_depot', 0, 7.5)
  playerGroup.position.set(0, 0, 9)
  playerGroup.rotation.y = state.player.angle
  coreGroup.position.set(0, 0, 0)
  placementGhost.visible = false
  rebuildLinks()
  rebuildBuildList()
  rebuildNetworkList()
  rebuildUpgradeList()
  updateHud()
}

function canPlaceStructure(kind, x, z) {
  if (Math.abs(x) > WORLD_HALF - 2 || Math.abs(z) > WORLD_HALF - 2) return false
  if (distance2d(x, z, 0, 0) < 5.2) return false
  if (spawnPoints.some((spawn) => distance2d(x, z, spawn.x, spawn.z) < 4)) return false
  if (state.salvageNodes.some((node) => distance2d(x, z, node.x, node.z) < 3.3)) return false
  if (state.structures.some((structure) => distance2d(x, z, structure.x, structure.z) < 2.5)) return false
  return state.resources.scrap >= structureDefs[kind].cost
}

function armLinkSource(structureId) {
  const structure = findStructure(structureId)
  if (!structure) return
  state.linkSourceId = structure.id
  rebuildNetworkList()
  setNotification(`已選擇來源：${structureDefs[structure.kind].label}。`)
}

function tryCreateLink(sourceId, targetId) {
  const source = findStructure(sourceId)
  const target = findStructure(targetId)
  if (!source || !target || source.id === target.id) return false
  if (state.links.some((link) => link.fromId === source.id && link.toId === target.id)) { setNotification('這條連線已存在。'); return false }
  if (distance2d(source.x, source.z, target.x, target.z) > LINK_DISTANCE) { setNotification('連線失敗：距離太遠。'); return false }
  if (outgoingCount(source.id) >= structureDefs[source.kind].linkSlots) { setNotification(`${structureDefs[source.kind].label} 沒有剩餘連線槽。`); return false }
  if (!structureDefs[target.kind].inputs.includes(source.kind)) { setNotification(`${structureDefs[target.kind].label} 不接受 ${structureDefs[source.kind].label}。`); return false }
  if (hasInput(target, source.kind)) { setNotification(`${structureDefs[target.kind].label} 已經接過這種來源。`); return false }
  state.links.push({ id: `l${++ids.link}`, fromId: source.id, toId: target.id })
  rebuildLinks()
  rebuildNetworkList()
  setNotification(`${structureDefs[source.kind].label} 已連到 ${structureDefs[target.kind].label}。`)
  return true
}

function raycastStructureId() {
  raycaster.setFromCamera({ x: pointer.ndcX, y: pointer.ndcY }, camera)
  const hits = raycaster.intersectObjects(structureGroup.children, true)
  if (!hits.length) return null
  let node = hits[0].object
  while (node && !node.userData.structureId) node = node.parent
  return node?.userData.structureId ?? null
}

function tryPlaceSelectedStructure() {
  const x = snapToGrid(pointer.worldX)
  const z = snapToGrid(pointer.worldZ)
  if (!canPlaceStructure(state.selectedBuild, x, z)) { setNotification('這裡不能放置：請確認距離、空間與廢料是否足夠。'); return }
  state.resources.scrap -= structureDefs[state.selectedBuild].cost
  const structure = createStructure(state.selectedBuild, x, z)
  refreshStructureVisual(structure)
  rebuildBuildList()
  setNotification(`${structureDefs[state.selectedBuild].label} 已部署，記得接上生產線。`)
}

function handleBuildClick() {
  if (state.phase !== 'build') return
  if (state.linkMode) {
    const clickedId = raycastStructureId()
    if (!clickedId) { state.linkSourceId = null; rebuildNetworkList(); setNotification('已清除連線來源。'); return }
    if (!state.linkSourceId) { armLinkSource(clickedId); return }
    if (state.linkSourceId === clickedId) { state.linkSourceId = null; rebuildNetworkList(); setNotification('已清除連線來源。'); return }
    if (tryCreateLink(state.linkSourceId, clickedId)) { state.linkSourceId = null; rebuildNetworkList() }
    return
  }
  tryPlaceSelectedStructure()
}

function draftUpgrades() {
  const pool = upgrades.filter((upgrade) => !state.selectedUpgradeIds.includes(upgrade.id))
  const picks = []
  while (picks.length < 3 && pool.length > 0) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return picks
}

function enterBuildPhase(initial) {
  state.phase = 'build'
  state.phaseTimeLeft = initial ? INITIAL_BUILD_SECONDS : BUILD_SECONDS
  state.linkMode = false
  state.linkSourceId = null
  refs.buildTitle.textContent = initial ? '初始部署' : `第 ${state.wave} 波整備`
  setNotification(initial ? '先把生產線接起來，再迎戰第一波。' : '擴建、重接與修補，準備迎接下一波。')
  showBanner(initial ? '建造時間' : `建造階段 · 第 ${state.wave} 波`)
  rebuildBuildList(); rebuildNetworkList(); updateHud()
}

function enterAssaultPhase() {
  state.phase = 'assault'
  state.phaseTimeLeft = ASSAULT_SECONDS
  state.spawnTimer = 0
  setNotification('屍潮來了，撐住火線並守住核心。')
  showBanner(`防守階段 · 第 ${state.wave} 波`)
  updateHud()
}

function enterUpgradePhase() {
  state.phase = 'upgrade'
  state.pendingUpgrades = draftUpgrades()
  refs.upgradeTitle.textContent = `第 ${state.wave} 波升級選擇`
  setNotification('從三張升級中選一張，補強這一局的節奏。')
  showBanner('升級選擇')
  rebuildUpgradeList(); updateHud()
}

function finishRun(mode) {
  state.phase = mode === 'victory' ? 'summary' : 'game_over'
  state.summaryMode = mode
  refs.summaryTitle.textContent = mode === 'victory' ? '防線守住了' : '防線失守'
  refs.summaryCopy.textContent = mode === 'victory' ? '這輪工廠順利運轉，下一局可以再把 ZPM 往上推。' : '雖然這局沒守住，但你已經有足夠資訊調整配置。'
  summaryGrid.innerHTML = [
    ['峰值 ZPM', state.peakZpm.toFixed(1)], ['平均 ZPM', state.averageZpm.toFixed(1)], ['到達波次', String(state.wave)],
    ['核心生命', `${Math.max(0, Math.round(state.core.hp))} / ${Math.round(state.core.maxHp)}`],
    ['玩家生命', `${Math.max(0, Math.round(state.player.hp))} / ${Math.round(state.player.maxHp)}`], ['總擊殺數', String(state.totalKills)],
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join('')
  showBanner(mode === 'victory' ? '任務完成' : '遊戲結束')
  updateHud()
}

function startRun() { resetRunWorld(); enterBuildPhase(true) }
function backToMenu() { resetRunWorld(); state.phase = 'menu'; updateHud() }

function refreshPointerFromEvent(event) {
  const bounds = canvas.getBoundingClientRect()
  pointer.ndcX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  pointer.ndcY = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  raycaster.setFromCamera({ x: pointer.ndcX, y: pointer.ndcY }, camera)
  if (raycaster.ray.intersectPlane(aimPlane, aimHit)) { pointer.worldX = aimHit.x; pointer.worldZ = aimHit.z }
}

function refreshPointer() {
  raycaster.setFromCamera({ x: pointer.ndcX, y: pointer.ndcY }, camera)
  if (raycaster.ray.intersectPlane(aimPlane, aimHit)) { pointer.worldX = aimHit.x; pointer.worldZ = aimHit.z }
}

function startReload() {
  if (state.player.reloadTimer > 0 || state.player.clipAmmo === PLAYER_CLIP_SIZE || state.player.reserveAmmo <= 0) return
  state.player.reloadTimer = 1.08
  setNotification('重新裝填中…')
}

function finishReload() {
  const missing = PLAYER_CLIP_SIZE - state.player.clipAmmo
  const loaded = Math.min(missing, state.player.reserveAmmo)
  state.player.clipAmmo += loaded
  state.player.reserveAmmo -= loaded
  setNotification('彈匣已補滿。')
}

function triggerRoll() {
  if (state.phase !== 'assault' || state.player.rollCooldown > 0 || state.player.rollTimer > 0) return
  let directionX = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  let directionZ = (input.back ? 1 : 0) - (input.forward ? 1 : 0)
  if (directionX === 0 && directionZ === 0) { directionX = Math.sin(state.player.angle); directionZ = Math.cos(state.player.angle) }
  const length = Math.hypot(directionX, directionZ) || 1
  state.player.rollX = directionX / length
  state.player.rollZ = directionZ / length
  state.player.rollTimer = 0.24
  state.player.rollCooldown = 2.1 * state.modifiers.rollCooldown
  setNotification('翻滾啟動。')
}

function chooseWeightedKind(mix) {
  const roll = Math.random()
  let cursor = 0
  for (const kind of ['walker', 'runner', 'brute']) { cursor += mix[kind]; if (roll <= cursor) return kind }
  return 'walker'
}

function createKillPickup(zombie) {
  const amount = Math.round((zombie.kind === 'brute' ? 7 : zombie.kind === 'runner' ? 3 : 4) * state.modifiers.salvageYield)
  createPickup(zombie.x, zombie.z, amount)
}

function registerKill(zombie) { state.totalKills += 1; state.killTimes.push(state.elapsedTime); createKillPickup(zombie) }
function damageZombie(zombie, amount) { zombie.hp -= amount; zombie.hitFlash = 0.12; if (zombie.hp <= 0) { registerKill(zombie); removeZombie(zombie) } }

function nearestZombieAlongRay(originX, originZ, dirX, dirZ, maxDistance, radius) {
  let bestTarget = null
  let bestAlong = Infinity
  state.zombies.forEach((zombie) => {
    const deltaX = zombie.x - originX
    const deltaZ = zombie.z - originZ
    const along = deltaX * dirX + deltaZ * dirZ
    if (along < 0 || along > maxDistance) return
    const perpendicular = Math.abs(deltaX * dirZ - deltaZ * dirX)
    if (perpendicular > radius) return
    if (along < bestAlong) { bestAlong = along; bestTarget = zombie }
  })
  return bestTarget
}
function firePlayerWeapon() {
  if (state.phase !== 'assault' || state.player.reloadTimer > 0) return
  if (state.player.clipAmmo <= 0) { if (state.player.reserveAmmo > 0) startReload(); else setNotification('彈匣空了，而且備彈也見底。'); return }
  const dirX = Math.sin(state.player.angle)
  const dirZ = Math.cos(state.player.angle)
  state.player.clipAmmo -= 1
  state.player.fireCooldown = 0.115 / state.modifiers.playerFireRate
  const target = nearestZombieAlongRay(state.player.x, state.player.z, dirX, dirZ, 20, 1.15)
  const end = target ? { x: target.x, y: 1.15, z: target.z } : { x: state.player.x + dirX * 19, y: 1.15, z: state.player.z + dirZ * 19 }
  createTracer({ x: state.player.x, y: 1.45, z: state.player.z }, end, '#ffd07d')
  if (target) damageZombie(target, 18 * state.modifiers.playerDamage)
}

function collectNearbyResources() {
  state.salvageNodes.forEach((node) => {
    if (node.cooldown > 0 || node.charges <= 0) return
    if (distance2d(state.player.x, state.player.z, node.x, node.z) < 2.05) {
      node.cooldown = 0.5
      node.charges -= 1
      const gain = Math.round(10 * state.modifiers.salvageYield)
      state.resources.scrap += gain
      setNotification(`從廢料點回收了 ${gain} 廢料。`)
    }
  })
  state.pickups = state.pickups.filter((pickup) => {
    if (distance2d(state.player.x, state.player.z, pickup.x, pickup.z) < 1.5) {
      state.resources.scrap += pickup.amount
      pickupGroup.remove(pickup.mesh)
      setNotification(`拾取廢料 +${pickup.amount}。`)
      return false
    }
    return true
  })
}

function processFactory() {
  state.structures.forEach((structure) => { structure.working = false })
  state.structures.forEach((structure) => {
    if (structure.kind !== 'generator' || !operational(structure) || state.resources.scrap < 1) return
    state.resources.scrap -= 1
    state.resources.power = clamp(state.resources.power + 2.1 * state.modifiers.generatorEfficiency, 0, 220)
    structure.working = true
  })
  state.structures.forEach((structure) => {
    if (structure.kind !== 'ammo_press' || !operational(structure)) return
    if (state.resources.scrap < 1 || state.resources.power < 0.6) return
    state.resources.scrap -= 1
    state.resources.power -= 0.6
    state.resources.ammo = clamp(state.resources.ammo + 5 * state.modifiers.ammoEfficiency, 0, 260)
    structure.working = true
  })
  state.structures.forEach((structure) => {
    if (structure.kind !== 'repair_station' || !operational(structure) || state.resources.power < 0.75) return
    const targets = [{ x: 0, z: 0, hp: state.core.hp, maxHp: state.core.maxHp, target: 'core' }, ...state.structures.map((entry) => ({ x: entry.x, z: entry.z, hp: entry.hp, maxHp: entry.maxHp, target: entry }))].filter((entry) => entry.hp < entry.maxHp)
    const repairTarget = targets.find((entry) => distance2d(entry.x, entry.z, structure.x, structure.z) < structureDefs.repair_station.range)
    if (!repairTarget) return
    const repairAmount = 7 * state.modifiers.repairEfficiency
    state.resources.power -= 0.75
    if (repairTarget.target === 'core') state.core.hp = clamp(state.core.hp + repairAmount, 0, state.core.maxHp)
    else { repairTarget.target.hp = clamp(repairTarget.target.hp + repairAmount, 0, repairTarget.target.maxHp); refreshStructureVisual(repairTarget.target) }
    structure.working = true
  })
  state.structures.forEach((structure) => refreshStructureVisual(structure))
}

function updateTurrets(delta) {
  state.structures.forEach((structure) => {
    if (structure.kind !== 'auto_turret') return
    structure.cooldown = Math.max(0, structure.cooldown - delta)
    if (!operational(structure) || state.resources.ammo < 1 || state.resources.power < 0.2) { structure.working = false; return }
    const target = state.zombies.filter((zombie) => distance2d(zombie.x, zombie.z, structure.x, structure.z) < structureDefs.auto_turret.range).sort((left, right) => distance2d(left.x, left.z, structure.x, structure.z) - distance2d(right.x, right.z, structure.x, structure.z))[0]
    if (!target || structure.cooldown > 0) return
    structure.cooldown = 0.55 / state.modifiers.turretFireRate
    state.resources.ammo -= 1
    state.resources.power -= 0.2
    structure.working = true
    const lookAngle = Math.atan2(target.x - structure.x, target.z - structure.z)
    const head = structure.mesh.getObjectByName('head')
    const barrel = structure.mesh.getObjectByName('barrel')
    if (head) head.rotation.y = lookAngle
    if (barrel) barrel.rotation.y = lookAngle
    createTracer({ x: structure.x, y: 1.8, z: structure.z }, { x: target.x, y: 1.15, z: target.z }, '#70ffd1')
    damageZombie(target, 16 * state.modifiers.turretDamage)
  })
}

function updateZombies(delta) {
  state.zombies.slice().forEach((zombie) => {
    zombie.cooldown = Math.max(0, zombie.cooldown - delta)
    zombie.hitFlash = Math.max(0, zombie.hitFlash - delta)
    const barricade = state.structures.find((structure) => structure.kind === 'barricade' && distance2d(zombie.x, zombie.z, structure.x, structure.z) < 2.05)
    const playerClose = distance2d(zombie.x, zombie.z, state.player.x, state.player.z) < 2
    let targetX = 0
    let targetZ = 0
    let targetKind = 'core'
    if (barricade && barricade.hp > 0) { targetX = barricade.x; targetZ = barricade.z; targetKind = barricade }
    else if (playerClose) { targetX = state.player.x; targetZ = state.player.z; targetKind = 'player' }
    const deltaX = targetX - zombie.x
    const deltaZ = targetZ - zombie.z
    const length = Math.hypot(deltaX, deltaZ) || 1
    if (length < 1.45) {
      if (zombie.cooldown <= 0) {
        zombie.cooldown = zombie.kind === 'runner' ? 0.85 : 1.05
        if (targetKind === 'player') {
          if (state.player.rollTimer <= 0) { state.player.hp = clamp(state.player.hp - zombie.damage, 0, state.player.maxHp); setNotification('工程師受傷了，快翻滾拉開距離。') }
        } else if (targetKind === 'core') {
          state.core.hp = clamp(state.core.hp - zombie.damage, 0, state.core.maxHp)
        } else {
          targetKind.hp = clamp(targetKind.hp - zombie.damage, 0, targetKind.maxHp)
          refreshStructureVisual(targetKind)
          if (targetKind.hp <= 0) { removeStructure(targetKind); setNotification('有建築被拆掉了，趕快補上。') }
        }
      }
    } else {
      const speed = barricade ? zombie.speed * 0.58 : zombie.speed
      zombie.x += deltaX / length * speed * delta
      zombie.z += deltaZ / length * speed * delta
    }
    zombie.mesh.position.set(zombie.x, 0, zombie.z)
    zombie.mesh.rotation.y = Math.atan2(deltaX, deltaZ)
    zombie.mesh.traverse((child) => {
      if (child.material && 'emissiveIntensity' in child.material) {
        const base = child.userData.baseEmissiveIntensity ?? 0.3
        child.material.emissiveIntensity = zombie.hitFlash > 0 ? 1.65 : base
      }
    })
  })
}

function updatePlayer(delta) {
  refreshPointer()
  const aimX = pointer.worldX - state.player.x
  const aimZ = pointer.worldZ - state.player.z
  state.player.angle = Math.atan2(aimX, aimZ)
  const forwardX = Math.sin(state.player.angle)
  const forwardZ = Math.cos(state.player.angle)
  const rightX = forwardZ
  const rightZ = -forwardX
  let moveX = 0
  let moveZ = 0
  if (input.forward) { moveX += forwardX; moveZ += forwardZ }
  if (input.back) { moveX -= forwardX; moveZ -= forwardZ }
  if (input.right) { moveX += rightX; moveZ += rightZ }
  if (input.left) { moveX -= rightX; moveZ -= rightZ }
  const moveLength = Math.hypot(moveX, moveZ) || 1
  if (moveX !== 0 || moveZ !== 0) { moveX /= moveLength; moveZ /= moveLength }
  const wasReloading = state.player.reloadTimer > 0
  state.player.fireCooldown = Math.max(0, state.player.fireCooldown - delta)
  state.player.reloadTimer = Math.max(0, state.player.reloadTimer - delta)
  state.player.rollCooldown = Math.max(0, state.player.rollCooldown - delta)
  state.player.rollTimer = Math.max(0, state.player.rollTimer - delta)
  if (wasReloading && state.player.reloadTimer === 0) finishReload()
  if (state.phase === 'assault' && input.firing && state.player.fireCooldown <= 0 && state.player.reloadTimer <= 0) firePlayerWeapon()
  const speed = state.player.rollTimer > 0 ? 16 : 6.2
  const appliedX = state.player.rollTimer > 0 ? state.player.rollX : moveX
  const appliedZ = state.player.rollTimer > 0 ? state.player.rollZ : moveZ
  state.player.x = clamp(state.player.x + appliedX * speed * delta, -WORLD_HALF + 1.3, WORLD_HALF - 1.3)
  state.player.z = clamp(state.player.z + appliedZ * speed * delta, -WORLD_HALF + 1.3, WORLD_HALF - 1.3)
  playerGroup.position.set(state.player.x, 0, state.player.z)
  playerGroup.rotation.y = state.player.angle
  refreshPlayerVisual()
}

function updatePickups(delta, time) {
  state.pickups = state.pickups.filter((pickup) => {
    pickup.ttl -= delta
    pickup.bob += delta * 4
    pickup.mesh.position.set(pickup.x, 0.75 + Math.sin(time * 5 + pickup.bob) * 0.18, pickup.z)
    pickup.mesh.rotation.y += delta * 2.4
    if (pickup.ttl <= 0) { pickupGroup.remove(pickup.mesh); return false }
    return true
  })
}

function updateTracers(delta) {
  state.tracers = state.tracers.filter((tracer) => {
    tracer.ttl -= delta
    if (tracer.ttl <= 0) { tracerGroup.remove(tracer.visual); return false }
    return true
  })
}

function updateSalvage(delta, time) {
  state.salvageNodes.forEach((node) => {
    node.cooldown = Math.max(0, node.cooldown - delta)
    const crystal = node.mesh.userData.crystal
    if (!crystal) return
    crystal.rotation.y += delta * 0.8
    crystal.material.emissiveIntensity = node.charges > 0 ? 0.55 + Math.sin(time * 4 + node.x) * 0.18 : 0.12
    crystal.scale.setScalar(node.charges > 0 ? 1 : 0.6)
  })
}

function refreshMetrics() {
  state.killTimes = state.killTimes.filter((time) => state.elapsedTime - time <= 60)
  state.liveZpm = state.killTimes.length
  state.peakZpm = Math.max(state.peakZpm, state.liveZpm)
  state.averageZpm = state.totalKills / Math.max(state.elapsedTime / 60, 1 / 60)
}

function updatePhase(delta) {
  if (state.phase === 'build') {
    state.phaseTimeLeft = Math.max(0, state.phaseTimeLeft - delta)
    if (state.phaseTimeLeft <= 0) enterAssaultPhase()
    return
  }
  if (state.phase === 'assault') {
    state.phaseTimeLeft = Math.max(0, state.phaseTimeLeft - delta)
    const wave = waveDefs[state.wave - 1]
    if (state.phaseTimeLeft > 0 && state.zombies.length < wave.cap) {
      state.spawnTimer -= delta
      if (state.spawnTimer <= 0) {
        const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)]
        const offset = (Math.random() - 0.5) * 2.8
        createZombie(chooseWeightedKind(wave.mix), spawn.x + offset, spawn.z + offset)
        state.spawnTimer = wave.every
      }
    }
    if (state.phaseTimeLeft <= 0 && state.zombies.length === 0) {
      if (state.wave >= MAX_WAVES) finishRun('victory')
      else enterUpgradePhase()
    }
  }
}

function updateCamera(delta) {
  desiredCamera.set(state.player.x - Math.sin(state.player.angle) * 8.8, 8.7, state.player.z - Math.cos(state.player.angle) * 8.8)
  camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 6))
  cameraLook.set(state.player.x, 1.4, state.player.z)
  camera.lookAt(cameraLook)
}

function refreshPlacementGhost() {
  if (state.phase !== 'build' || state.linkMode || !state.selectedBuild) { placementGhost.visible = false; return }
  const x = snapToGrid(pointer.worldX)
  const z = snapToGrid(pointer.worldZ)
  placementGhost.visible = true
  placementGhost.position.set(x, 0.05, z)
  const valid = canPlaceStructure(state.selectedBuild, x, z)
  placementGhost.material.color.set(valid ? '#63ffbf' : '#ff756f')
  placementGhost.material.emissive.set(valid ? '#63ffbf' : '#ff756f')
}

function animateWorld(time) {
  refreshCoreVisual(time)
  staticPulseObjects.forEach((ring, index) => { const scale = 0.94 + Math.sin(time * 3.4 + index) * 0.08; ring.scale.setScalar(scale) })
  coreGroup.rotation.y += 0.004
}

function updateGame(delta, time) {
  if (!['menu', 'summary', 'game_over', 'upgrade'].includes(state.phase)) state.elapsedTime += delta
  updatePlayer(delta)
  collectNearbyResources()
  updateSalvage(delta, time)
  if (state.phase === 'build' || state.phase === 'assault') {
    state.factoryTimer += delta
    while (state.factoryTimer >= 0.6) { state.factoryTimer -= 0.6; processFactory() }
  }
  if (state.phase === 'assault') { updateTurrets(delta); updateZombies(delta) }
  updatePickups(delta, time)
  updateTracers(delta)
  refreshMetrics()
  updatePhase(delta)
  if (state.player.hp <= 0 || state.core.hp <= 0) finishRun('defeat')
  refreshPlacementGhost()
  updateCamera(delta)
  animateWorld(time)
  uiAccumulator += delta
  if (uiAccumulator >= 0.08) { uiAccumulator = 0; updateHud(); rebuildBuildList(); rebuildNetworkList() }
}

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

startButton.addEventListener('click', startRun)
restartButton.addEventListener('click', startRun)
menuButton.addEventListener('click', backToMenu)
linkButton.addEventListener('click', () => {
  if (state.phase !== 'build') return
  state.linkMode = !state.linkMode
  state.linkSourceId = null
  updateHud(); rebuildNetworkList()
  setNotification(state.linkMode ? '請先點來源，再點可接受的目標。' : '已關閉連線模式。')
})
canvas.addEventListener('mousemove', refreshPointerFromEvent)
canvas.addEventListener('mousedown', (event) => { refreshPointerFromEvent(event); if (event.button !== 0) return; if (state.phase === 'build') handleBuildClick(); else if (state.phase === 'assault') input.firing = true })
window.addEventListener('mouseup', () => { input.firing = false })
canvas.addEventListener('mouseleave', () => { input.firing = false })
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyW') input.forward = true
  if (event.code === 'KeyS') input.back = true
  if (event.code === 'KeyA') input.left = true
  if (event.code === 'KeyD') input.right = true
  if (event.code === 'Space') { event.preventDefault(); triggerRoll() }
  if (event.code === 'KeyR') startReload()
  if (event.code === 'KeyL' && state.phase === 'build') linkButton.click()
  if (/Digit[1-6]/.test(event.code) && state.phase === 'build') { const index = Number(event.code.slice(-1)) - 1; state.selectedBuild = buildOrder[index] || state.selectedBuild; rebuildBuildList() }
})
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyW') input.forward = false
  if (event.code === 'KeyS') input.back = false
  if (event.code === 'KeyA') input.left = false
  if (event.code === 'KeyD') input.right = false
})
window.addEventListener('blur', () => { input.forward = false; input.back = false; input.left = false; input.right = false; input.firing = false })
window.addEventListener('resize', resize)

makeWorld()
resetRunWorld()
state.phase = 'menu'
updateHud()
resize()

let previous = performance.now()
function frame(now) {
  const delta = Math.min(0.05, (now - previous) / 1000)
  previous = now
  updateGame(delta, now / 1000)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
