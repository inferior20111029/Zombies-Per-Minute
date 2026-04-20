import { Line, useAnimations, useGLTF } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinnedScene } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  CELL_SIZE,
  CORE_CELL,
  GRID_SIZE,
  MAX_PICKUPS,
  MAX_TRACERS,
  MAX_ZOMBIES,
  SALVAGE_CELLS,
  SPAWN_CELLS,
  STRUCTURE_DEFS,
} from './data.ts'
import { cellToWorld } from './logic.ts'
import { useGameStore } from './store.ts'
import type { StructureKind } from './types.ts'

const BUILD_HOTKEYS: StructureKind[] = [
  'scrap_depot',
  'generator',
  'ammo_press',
  'auto_turret',
  'barricade',
  'repair_station',
]

const SHOWCASE_ZOMBIE_COUNT = 5
const ZOMBIE_MODEL_URL = '/models/zombie-walk-fast.glb'
const ZOMBIE_MODEL_SCALE = 0.48
const ZOMBIE_MODEL_HEADING_OFFSET = Math.PI

export function GameViewport() {
  const mode = useGameStore((state) => state.mode)
  useKeyboardBindings(mode === 'playing')

  return (
    <Canvas
      shadows="percentage"
      dpr={1}
      camera={{ position: [0, 9.8, 15.5], fov: 50, near: 0.1, far: 120 }}
      gl={{
        antialias: true,
        alpha: false,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05

        const domCanvas = gl.domElement
        domCanvas.addEventListener('webglcontextlost', (event) => {
          event.preventDefault()
        })
      }}
    >
      <SceneRoot />
    </Canvas>
  )
}

function useKeyboardBindings(active: boolean) {
  useEffect(() => {
    function setMovement(code: string, pressed: boolean) {
      const state = useGameStore.getState()
      if (code === 'KeyW') state.setMoveKey('forward', pressed)
      if (code === 'KeyS') state.setMoveKey('back', pressed)
      if (code === 'KeyA') state.setMoveKey('left', pressed)
      if (code === 'KeyD') state.setMoveKey('right', pressed)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!active) return

      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR'].includes(event.code)) {
        event.preventDefault()
      }

      setMovement(event.code, true)

      const store = useGameStore.getState()
      if (event.code === 'Space') store.queueRoll()
      if (event.code === 'KeyR') store.queueReload()
      if (event.code === 'KeyL') store.toggleLinkMode()

      const digit = Number.parseInt(event.code.replace('Digit', ''), 10)
      if (!Number.isNaN(digit)) {
        if (store.hud.phase === 'build' && digit >= 1 && digit <= BUILD_HOTKEYS.length) {
          store.selectBuildKind(BUILD_HOTKEYS[digit - 1] ?? null)
        }

        if (
          store.hud.phase === 'upgrade' &&
          digit >= 1 &&
          digit <= store.hud.pendingUpgrades.length
        ) {
          const upgrade = store.hud.pendingUpgrades[digit - 1]
          if (upgrade) {
            store.chooseUpgrade(upgrade.id)
          }
        }
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      setMovement(event.code, false)
    }

    function resetState() {
      const store = useGameStore.getState()
      store.setMoveKey('forward', false)
      store.setMoveKey('back', false)
      store.setMoveKey('left', false)
      store.setMoveKey('right', false)
      store.setFiring(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mouseup', resetState)
    window.addEventListener('blur', resetState)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mouseup', resetState)
      window.removeEventListener('blur', resetState)
    }
  }, [active])
}

function SceneRoot() {
  const simulation = useGameStore((state) => state.simulation)
  const tick = useGameStore((state) => state.tick)
  const mode = useGameStore((state) => state.mode)
  const sceneRevision = useGameStore((state) => state.sceneRevision)
  const phase = useGameStore((state) => state.hud.phase)
  const linkSourceId = useGameStore((state) => state.hud.linkSourceId)
  const selectedBuildKind = useGameStore((state) => state.hud.selectedBuildKind)

  const playerRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Group>(null)
  const previewRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()

  const forward = useMemo(() => new THREE.Vector3(), [])
  const desiredCamera = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    if (mode === 'playing') {
      tick(dt)
    }

    const player = simulation.player

    if (playerRef.current) {
      playerRef.current.position.set(player.position.x, 0.95, player.position.y)
      playerRef.current.rotation.y = player.facing
    }

    if (coreRef.current) {
      const corePosition = cellToWorld(CORE_CELL)
      coreRef.current.position.set(corePosition.x, 0, corePosition.y)
    }

    if (previewRef.current) {
      const previewCell = simulation.getPreviewCell()
      const previewPosition = cellToWorld(previewCell)
      const previewValidity = simulation.getPreviewValidity()
      previewRef.current.visible = phase === 'build' && Boolean(selectedBuildKind)
      previewRef.current.position.set(previewPosition.x, 0.06, previewPosition.y)

      const material = previewRef.current.material as THREE.MeshStandardMaterial
      material.color.set(previewValidity.ok ? '#48ffd2' : '#ff6e7a')
      material.emissive.set(previewValidity.ok ? '#48ffd2' : '#ff6e7a')
    }

    forward.set(Math.sin(player.facing), 0, Math.cos(player.facing))
    desiredCamera.set(
      player.position.x - forward.x * 8.2,
      7.9,
      player.position.y - forward.z * 8.2,
    )

    camera.position.lerp(desiredCamera, 0.12)
    camera.lookAt(player.position.x, 1.45, player.position.y)
  })

  return (
    <>
      <color attach="background" args={['#0f0b0a']} />
      <fog attach="fog" args={['#0f0b0a', 16, 54]} />

      <ambientLight intensity={0.24} color="#9a9189" />
      <directionalLight
        castShadow
        intensity={1.7}
        position={[10, 18, 6]}
        color="#ffd4b2"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />
      <directionalLight intensity={0.65} position={[-14, 8, -12]} color="#7fcfff" />

      <Ground />

      <gridHelper
        args={[GRID_SIZE * CELL_SIZE, GRID_SIZE, '#27453d', '#1b2420']}
        visible={phase === 'build'}
        position={[0, 0.02, 0]}
      />

      <DebrisField />
      <SpawnBeacons />
      <SalvageNodes />
      <CoreActor innerRef={coreRef} />

      {simulation.structures.map((structure) => (
        <StructureActor
          key={structure.id}
          structureId={structure.id}
          highlight={linkSourceId === structure.id}
        />
      ))}

      {simulation.links.map((link) => {
        const fromStructure = simulation.getStructureById(link.fromId)
        const toStructure = simulation.getStructureById(link.toId)
        if (!fromStructure || !toStructure || fromStructure.hp <= 0 || toStructure.hp <= 0) {
          return null
        }

        const from = cellToWorld(fromStructure.cell)
        const to = cellToWorld(toStructure.cell)

        return (
          <Line
            key={`${sceneRevision}-${link.id}`}
            points={[
              [from.x, 1.1, from.y],
              [to.x, 1.1, to.y],
            ]}
            color="#7ce5ff"
            lineWidth={1.4}
            dashed={false}
          />
        )
      })}

      <PlayerActor innerRef={playerRef} />
      <Suspense fallback={null}>
        <ZombieShowcase />
      </Suspense>
      <ZombieInstances />
      <PickupInstances />
      <TracerInstances />

      <mesh ref={previewRef} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.58, 0.94, 24]} />
        <meshStandardMaterial transparent opacity={0.7} />
      </mesh>
    </>
  )
}

function Ground() {
  const phase = useGameStore((state) => state.hud.phase)
  const mode = useGameStore((state) => state.mode)
  const setAimPoint = useGameStore((state) => state.setAimPoint)
  const setFiring = useGameStore((state) => state.setFiring)
  const handleGroundClick = useGameStore((state) => state.handleGroundClick)

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    setAimPoint({ x: event.point.x, y: event.point.z })
  }

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    setAimPoint({ x: event.point.x, y: event.point.z })

    if (mode !== 'playing') return

    if (phase === 'build') {
      handleGroundClick({ x: event.point.x, y: event.point.z })
    }

    if (phase === 'assault') {
      setFiring(true)
    }
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, -0.01, 0]}
      receiveShadow
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={() => setFiring(false)}
    >
      <planeGeometry args={[GRID_SIZE * CELL_SIZE * 1.35, GRID_SIZE * CELL_SIZE * 1.35]} />
      <meshStandardMaterial color="#1a1413" roughness={0.98} metalness={0.04} />
    </mesh>
  )
}

function PlayerActor({ innerRef }: { innerRef: RefObject<THREE.Group | null> }) {
  return (
    <group ref={innerRef}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.35, 1, 4, 8]} />
        <meshStandardMaterial color="#d8d1ca" roughness={0.28} />
      </mesh>
      <mesh castShadow position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#ba9e8d" roughness={0.42} />
      </mesh>
      <mesh castShadow position={[0.26, 1.2, 0.38]} rotation={[0.2, 0.08, 0]}>
        <boxGeometry args={[0.16, 0.16, 0.82]} />
        <meshStandardMaterial color="#222222" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

function CoreActor({ innerRef }: { innerRef: RefObject<THREE.Group | null> }) {
  return (
    <group ref={innerRef}>
      <mesh castShadow receiveShadow position={[0, 0.8, 0]}>
        <cylinderGeometry args={[1.8, 2.1, 1.6, 8]} />
        <meshStandardMaterial color="#3d2d28" metalness={0.26} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[0, 2, 0]}>
        <cylinderGeometry args={[0.7, 1.2, 1.8, 8]} />
        <meshStandardMaterial color="#7f96ff" emissive="#4d69ff" emissiveIntensity={1} />
      </mesh>
    </group>
  )
}

function StructureActor({
  structureId,
  highlight,
}: {
  structureId: string
  highlight: boolean
}) {
  const simulation = useGameStore((state) => state.simulation)
  const handleStructureClick = useGameStore((state) => state.handleStructureClick)
  const phase = useGameStore((state) => state.hud.phase)
  const structure = simulation.getStructureById(structureId)
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (!groupRef.current) return
    const nextStructure = simulation.getStructureById(structureId)
    groupRef.current.visible = Boolean(nextStructure && nextStructure.hp > 0)
  })

  if (!structure) return null

  const world = cellToWorld(structure.cell)
  const color = highlight ? '#f4f27d' : STRUCTURE_DEFS[structure.kind].color

  return (
    <group
      ref={groupRef}
      position={[world.x, 0, world.y]}
      onPointerDown={(event) => {
        if (phase === 'build') {
          event.stopPropagation()
          handleStructureClick(structureId)
        }
      }}
    >
      {structure.kind === 'scrap_depot' && (
        <>
          <mesh castShadow receiveShadow position={[0, 0.75, 0]}>
            <boxGeometry args={[1.6, 1.5, 1.6]} />
            <meshStandardMaterial color={color} roughness={0.78} />
          </mesh>
          <mesh castShadow position={[0, 1.55, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.5, 6]} />
            <meshStandardMaterial color="#27211d" />
          </mesh>
        </>
      )}

      {structure.kind === 'generator' && (
        <>
          <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.9, 0.95, 1.44, 8]} />
            <meshStandardMaterial color={color} metalness={0.25} roughness={0.45} />
          </mesh>
          <mesh castShadow position={[0, 1.55, 0]}>
            <boxGeometry args={[0.7, 0.34, 0.7]} />
            <meshStandardMaterial color="#0d1824" emissive="#3a84ff" emissiveIntensity={0.75} />
          </mesh>
        </>
      )}

      {structure.kind === 'ammo_press' && (
        <>
          <mesh castShadow receiveShadow position={[0, 0.64, 0]}>
            <boxGeometry args={[1.3, 1.28, 1.1]} />
            <meshStandardMaterial color={color} metalness={0.28} roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0.32, 1.32, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.92, 12]} />
            <meshStandardMaterial color="#26162d" emissive="#b765ff" emissiveIntensity={0.6} />
          </mesh>
        </>
      )}

      {structure.kind === 'auto_turret' && (
        <>
          <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.55, 0.65, 0.8, 6]} />
            <meshStandardMaterial color="#27342f" />
          </mesh>
          <mesh castShadow position={[0, 1.05, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.42, 0.42, 1.28]} />
            <meshStandardMaterial color={color} metalness={0.38} roughness={0.38} />
          </mesh>
        </>
      )}

      {structure.kind === 'barricade' && (
        <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
          <boxGeometry args={[1.8, 1.3, 0.62]} />
          <meshStandardMaterial color={color} roughness={0.82} />
        </mesh>
      )}

      {structure.kind === 'repair_station' && (
        <>
          <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.72, 0.82, 1.3, 8]} />
            <meshStandardMaterial color={color} metalness={0.18} roughness={0.42} />
          </mesh>
          <mesh castShadow position={[0, 1.6, 0]}>
            <torusGeometry args={[0.4, 0.12, 8, 20]} />
            <meshStandardMaterial color="#d5fff8" emissive="#5cf2d9" emissiveIntensity={0.85} />
          </mesh>
        </>
      )}
    </group>
  )
}

function ZombieShowcase() {
  return (
    <>
      {Array.from({ length: SHOWCASE_ZOMBIE_COUNT }, (_, slotIndex) => (
        <AnimatedZombieActor key={slotIndex} slotIndex={slotIndex} />
      ))}
    </>
  )
}

function AnimatedZombieActor({ slotIndex }: { slotIndex: number }) {
  const simulation = useGameStore((state) => state.simulation)
  const gltf = useGLTF(ZOMBIE_MODEL_URL)
  const root = useMemo(() => {
    const cloned = cloneSkinnedScene(gltf.scene) as THREE.Group
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
        child.castShadow = false
        child.receiveShadow = false
        child.frustumCulled = false
      }
    })
    return cloned
  }, [gltf.scene])
  const { actions, mixer } = useAnimations(gltf.animations, root)
  const clipName = gltf.animations[0]?.name
  const desiredScale = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!clipName) return
    const action = actions[clipName]
    if (!action) return

    action.reset()
    action.enabled = true
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.fadeIn(0.2)
    action.timeScale = 0.92 + slotIndex * 0.04
    action.play()

    return () => {
      action.fadeOut(0.1)
      action.stop()
    }
  }, [actions, clipName, slotIndex])

  useFrame((_, dt) => {
    const zombie = simulation.getZombieVisualStateAt(slotIndex)
    root.visible = Boolean(zombie)
    if (!zombie) return

    mixer.update(dt)

    root.position.set(zombie.position.x, 0, zombie.position.y)
    root.rotation.y = zombie.heading + ZOMBIE_MODEL_HEADING_OFFSET
    desiredScale.setScalar(ZOMBIE_MODEL_SCALE * zombie.scale)
    root.scale.lerp(desiredScale, 0.24)
  })

  return <primitive object={root} />
}

function ZombieInstances() {
  const simulation = useGameStore((state) => state.simulation)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const temp = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const total = simulation.getZombieVisualCount()
    const offset = Math.min(SHOWCASE_ZOMBIE_COUNT, total)
    const count = Math.max(0, total - offset)

    for (let index = 0; index < count; index += 1) {
      const zombie = simulation.getZombieVisualStateAt(index + offset)
      if (!zombie) {
        continue
      }
      temp.position.set(zombie.position.x, 0.75 * zombie.scale, zombie.position.y)
      temp.rotation.set(0, zombie.heading, 0)
      temp.scale.set(0.68 * zombie.scale, 1.28 * zombie.scale, 0.68 * zombie.scale)
      temp.updateMatrix()

      mesh.setMatrixAt(index, temp.matrix)
      color.setRGB(zombie.color.r, zombie.color.g, zombie.color.b)
      mesh.setColorAt(index, color)
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_ZOMBIES]} frustumCulled={false}>
      <boxGeometry args={[0.56, 1, 0.56]} />
      <meshStandardMaterial metalness={0.05} roughness={0.84} />
    </instancedMesh>
  )
}

function PickupInstances() {
  const simulation = useGameStore((state) => state.simulation)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const temp = useMemo(() => new THREE.Object3D(), [])

  useFrame((frameState) => {
    const mesh = meshRef.current
    if (!mesh) return

    const count = simulation.getPickupVisualCount()
    const time = frameState.clock.elapsedTime

    for (let index = 0; index < count; index += 1) {
      const pickup = simulation.getPickupVisualStateAt(index)
      if (!pickup) {
        continue
      }
      temp.position.set(pickup.position.x, 0.38, pickup.position.y)
      temp.rotation.set(0, time * 1.2 + index, 0)
      temp.scale.setScalar(pickup.scale)
      temp.updateMatrix()
      mesh.setMatrixAt(index, temp.matrix)
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_PICKUPS]} frustumCulled={false}>
      <octahedronGeometry args={[0.34, 0]} />
      <meshStandardMaterial color="#ffc768" emissive="#ff9f45" emissiveIntensity={0.9} />
    </instancedMesh>
  )
}

function TracerInstances() {
  const simulation = useGameStore((state) => state.simulation)
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const temp = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const midpoint = useMemo(() => new THREE.Vector3(), [])
  const end = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const count = simulation.getTracerVisualCount()

    for (let index = 0; index < count; index += 1) {
      const trace = simulation.getTracerVisualStateAt(index)
      if (!trace) {
        continue
      }

      midpoint.set((trace.start.x + trace.end.x) * 0.5, 0.7, (trace.start.y + trace.end.y) * 0.5)
      end.set(trace.end.x, 0.7, trace.end.y)
      direction.subVectors(end, midpoint)

      temp.position.copy(midpoint)
      temp.lookAt(end)
      temp.scale.set(0.06, 0.06, direction.length() * 2)
      temp.updateMatrix()

      mesh.setMatrixAt(index, temp.matrix)
      color.setRGB(1, 0.8 * trace.alpha, 0.4 * trace.alpha)
      mesh.setColorAt(index, color)
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_TRACERS]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial transparent opacity={0.92} toneMapped={false} />
    </instancedMesh>
  )
}

function SalvageNodes() {
  return (
    <>
      {SALVAGE_CELLS.map((cell, index) => {
        const world = cellToWorld(cell)
        return (
          <group key={index} position={[world.x, 0, world.y]}>
            <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.75, 0.95, 0.8, 6]} />
              <meshStandardMaterial color="#866147" roughness={0.88} />
            </mesh>
            <mesh castShadow position={[0, 0.94, 0]}>
              <octahedronGeometry args={[0.35, 0]} />
              <meshStandardMaterial color="#ffbf71" emissive="#ff9c45" emissiveIntensity={0.9} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

function SpawnBeacons() {
  return (
    <>
      {SPAWN_CELLS.map((cell, index) => {
        const world = cellToWorld(cell)
        return (
          <group key={index} position={[world.x, 0, world.y]}>
            <mesh castShadow position={[0, 1.2, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 2.4, 8]} />
              <meshStandardMaterial color="#471b1b" emissive="#ff4d4d" emissiveIntensity={1.2} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
              <ringGeometry args={[0.6, 1.2, 20]} />
              <meshBasicMaterial color="#ff6464" transparent opacity={0.65} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

function DebrisField() {
  const props = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => ({
        position: [
          (Math.random() - 0.5) * GRID_SIZE * CELL_SIZE * 0.92,
          0.2 + Math.random() * 0.22,
          (Math.random() - 0.5) * GRID_SIZE * CELL_SIZE * 0.92,
        ] as const,
        rotation: [0, Math.random() * Math.PI, 0] as const,
        scale: 0.5 + Math.random() * 0.9,
        type: index % 3,
      })),
    [],
  )

  return (
    <>
      {props.map((prop, index) => (
        <mesh
          key={index}
          castShadow
          receiveShadow
          position={prop.position}
          rotation={prop.rotation}
          scale={prop.scale}
        >
          {prop.type === 0 && <boxGeometry args={[0.9, 0.4, 0.9]} />}
          {prop.type === 1 && <cylinderGeometry args={[0.24, 0.34, 0.8, 6]} />}
          {prop.type === 2 && <dodecahedronGeometry args={[0.42, 0]} />}
          <meshStandardMaterial color="#2a221f" roughness={0.94} />
        </mesh>
      ))}
    </>
  )
}

useGLTF.preload(ZOMBIE_MODEL_URL)
