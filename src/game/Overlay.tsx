import gsap from 'gsap'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { STRUCTURE_DEFS } from './data.ts'
import { useGameStore } from './store.ts'

const BUILD_HOTKEY_LABELS = ['1', '2', '3', '4', '5', '6']

function formatTime(seconds: number) {
  const clamped = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(clamped / 60)
  const remaining = clamped % 60
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

function getPhaseLabel(phase: string, initialBuild: boolean) {
  if (phase === 'build' && initialBuild) {
    return '初始整備'
  }
  if (phase === 'build') {
    return '建造階段'
  }
  if (phase === 'assault') {
    return '屍潮進攻'
  }
  if (phase === 'upgrade') {
    return '升級選擇'
  }
  if (phase === 'summary') {
    return '回合結算'
  }
  return '失敗'
}

function getRarityLabel(rarity: string) {
  if (rarity === 'common') {
    return '普通'
  }
  if (rarity === 'rare') {
    return '稀有'
  }
  if (rarity === 'epic') {
    return '史詩'
  }
  return rarity
}

function getCategoryLabel(category: string) {
  if (category === 'weapon') {
    return '武器'
  }
  if (category === 'turret') {
    return '砲塔'
  }
  if (category === 'economy') {
    return '經濟'
  }
  if (category === 'survival') {
    return '生存'
  }
  return category
}

export function GameOverlays() {
  const mode = useGameStore((state) => state.mode)

  return (
    <>
      {mode === 'playing' && <PhaseBanner />}
      {mode === 'menu' ? <MenuOverlay /> : <PlayingHud />}
    </>
  )
}

function MenuOverlay() {
  const startRun = useGameStore((state) => state.startRun)

  return (
    <div className="menu-overlay">
      <div className="menu-card">
        <div className="eyebrow">Three.js + React + GSAP 瀏覽器 3D 原型</div>
        <h1>Zombies Per Minute</h1>
        <p className="menu-copy">
          撐過五波屍潮、維持工廠核心運轉，把廢料轉成電力與彈藥，
          用你的巔峰 ZPM 衝上排行榜。
        </p>
        <div className="menu-grid">
          <div>
            <h2>核心循環</h2>
            <ul>
              <li>第三人稱步槍戰鬥與翻滾閃避</li>
              <li>建造階段放置建築並手動連接物流</li>
              <li>依賴供電與彈藥的自動砲塔防線</li>
            </ul>
          </div>
          <div>
            <h2>操作方式</h2>
            <ul>
              <li>`WASD` 移動</li>
              <li>滑鼠瞄準，按住左鍵射擊</li>
              <li>`Space` 翻滾、`R` 裝填、`L` 連線模式</li>
            </ul>
          </div>
        </div>
        <button className="primary-button" onClick={startRun}>
          開始原型試玩
        </button>
      </div>
    </div>
  )
}

function PlayingHud() {
  const hud = useGameStore((state) => state.hud)
  const returnToMenu = useGameStore((state) => state.returnToMenu)

  return (
    <>
      <div className="hud-shell">
        <div className="hud-row top">
          <div className="stat-group">
            <div className="label">波次</div>
            <div className="value">{hud.waveIndex}</div>
          </div>
          <div className="stat-group emphasis">
            <div className="label">{getPhaseLabel(hud.phase, hud.initialBuild)}</div>
            <div className="value">{formatTime(hud.phaseTimeLeft)}</div>
          </div>
          <div className="stat-group">
            <div className="label">即時 ZPM</div>
            <div className="value accent">{hud.liveZpm.toFixed(0)}</div>
          </div>
          <div className="stat-group">
            <div className="label">峰值</div>
            <div className="value">{hud.peakZpm.toFixed(0)}</div>
          </div>
        </div>
        <div className="hud-row middle">
          <div className="health-card">
            <span>工程師</span>
            <strong>
              {hud.playerHp}/{hud.playerMaxHp}
            </strong>
          </div>
          <div className="health-card">
            <span>工廠核心</span>
            <strong>
              {hud.coreHp}/{hud.coreMaxHp}
            </strong>
          </div>
          <div className="ammo-card">
            <span>步槍彈藥</span>
            <strong>
              {hud.clipAmmo}/{hud.reserveAmmo}
            </strong>
          </div>
        </div>
        <div className="hud-row bottom">
          <div className="resource-pill">廢料 {hud.resources.scrap.toFixed(0)}</div>
          <div className="resource-pill">電力 {hud.resources.power.toFixed(0)}</div>
          <div className="resource-pill">彈藥 {hud.resources.ammo.toFixed(0)}</div>
          <div className="resource-pill">擊殺 {hud.totalKills}</div>
        </div>
        <div className="notification-bar">{hud.notification}</div>
        <button className="ghost-button menu" onClick={returnToMenu}>
          返回主選單
        </button>
      </div>
      {(hud.phase === 'build' || hud.phase === 'upgrade') && (
        <div className="overlay-shade" />
      )}
      {hud.phase === 'build' && <BuildPanel />}
      {hud.phase === 'upgrade' && <UpgradePanel />}
      {(hud.phase === 'summary' || hud.phase === 'game_over') && <SummaryPanel />}
      <ControlRibbon />
    </>
  )
}

function BuildPanel() {
  const hud = useGameStore((state) => state.hud)
  const simulation = useGameStore((state) => state.simulation)
  const selectBuildKind = useGameStore((state) => state.selectBuildKind)
  const toggleLinkMode = useGameStore((state) => state.toggleLinkMode)
  const buildOrder = simulation.getBuildOrder()

  return (
    <div className="side-panel right">
      <div className="panel-header">
        <div>
          <span className="eyebrow">建造 / 維修 / 連線</span>
          <h2>{hud.initialBuild ? '初始整備' : `第 ${hud.waveIndex} 波整備`}</h2>
        </div>
        <button
          className={`ghost-button ${hud.linkMode ? 'active' : ''}`}
          onClick={toggleLinkMode}
        >
          {hud.linkMode ? '連線模式：開' : '連線模式：關'}
        </button>
      </div>
      <div className="build-list">
        {buildOrder.map((kind, index) => {
          const def = STRUCTURE_DEFS[kind]
          return (
            <button
              key={kind}
              className={`build-card ${hud.selectedBuildKind === kind ? 'selected' : ''}`}
              onClick={() => selectBuildKind(kind)}
            >
              <div className="build-card-top">
                <span className="hotkey">{BUILD_HOTKEY_LABELS[index]}</span>
                <strong>{def.label}</strong>
                <span>{def.cost} 廢料</span>
              </div>
              <div className="build-card-copy">{def.placementRules}</div>
            </button>
          )
        })}
      </div>
      <div className="network-list">
        <div className="section-label">目前網路</div>
        {hud.structureSummaries.map((structure) => (
          <div key={structure.id} className="network-row">
            <strong>{structure.label}</strong>
            <span>
              耐久 {structure.hp} · 連線 {structure.linkCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpgradePanel() {
  const hud = useGameStore((state) => state.hud)
  const chooseUpgrade = useGameStore((state) => state.chooseUpgrade)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) {
      return
    }
    const tween = gsap.fromTo(
      panel,
      { opacity: 0, y: 24, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' },
    )

    return () => {
      tween.kill()
    }
  }, [hud.pendingUpgrades])

  return (
    <div className="center-panel" ref={panelRef}>
      <div className="eyebrow">三選一</div>
      <h2>第 {hud.waveIndex} 波升級選擇</h2>
      <div className="upgrade-grid">
        {hud.pendingUpgrades.map((upgrade, index) => (
          <button
            key={upgrade.id}
            className="upgrade-card"
            onClick={() => chooseUpgrade(upgrade.id)}
          >
            <span className="rarity">{getRarityLabel(upgrade.rarity)}</span>
            <strong>
              {index + 1}. {upgrade.label}
            </strong>
            <p>{upgrade.uiText}</p>
            <span className="category">{getCategoryLabel(upgrade.category)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SummaryPanel() {
  const hud = useGameStore((state) => state.hud)
  const startRun = useGameStore((state) => state.startRun)
  const returnToMenu = useGameStore((state) => state.returnToMenu)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) {
      return
    }
    const tween = gsap.fromTo(
      panel,
      { opacity: 0, scale: 0.94, y: 28 },
      { opacity: 1, scale: 1, y: 0, duration: 0.34, ease: 'power2.out' },
    )

    return () => {
      tween.kill()
    }
  }, [hud.phase])

  const title = hud.phase === 'summary' ? '成功生還' : '防線崩潰'
  const scoreRows = useMemo(
    () => [
      { label: '峰值 ZPM', value: hud.peakZpm.toFixed(0) },
      { label: '平均 ZPM', value: hud.averageZpm.toFixed(1) },
      { label: '總擊殺', value: hud.totalKills.toString() },
      { label: '核心耐久', value: `${hud.coreHp}/${hud.coreMaxHp}` },
    ],
    [hud],
  )

  return (
    <div className="center-panel summary" ref={panelRef}>
      <div className="eyebrow">回合結果</div>
      <h2>{title}</h2>
      <p>{hud.notification}</p>
      <div className="summary-grid">
        {scoreRows.map((row) => (
          <div key={row.label} className="summary-card">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button className="primary-button" onClick={startRun}>
          再來一場
        </button>
        <button className="ghost-button" onClick={returnToMenu}>
          返回主選單
        </button>
      </div>
    </div>
  )
}

function ControlRibbon() {
  const hud = useGameStore((state) => state.hud)
  return (
    <div className="control-ribbon">
      <span>`WASD` 移動</span>
      <span>滑鼠瞄準 / 按住開火</span>
      <span>`Space` 翻滾</span>
      <span>`R` 裝填</span>
      {hud.phase === 'build' && <span>`1-6` 選建築，`L` 切換連線</span>}
      {hud.phase === 'upgrade' && <span>`1-3` 選升級</span>}
    </div>
  )
}

function PhaseBanner() {
  const phase = useGameStore((state) => state.hud.phase)
  const initialBuild = useGameStore((state) => state.hud.initialBuild)
  const bannerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const banner = bannerRef.current
    if (!banner) {
      return
    }
    const timeline = gsap.timeline()
    timeline.fromTo(
      banner,
      { y: -20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out' },
    )
    timeline.to(banner, {
      opacity: 0.72,
      duration: 0.5,
      delay: 1.1,
    })

    return () => {
      timeline.kill()
    }
  }, [phase, initialBuild])

  return (
    <div className="phase-banner" ref={bannerRef}>
      {getPhaseLabel(phase, initialBuild)}
    </div>
  )
}


