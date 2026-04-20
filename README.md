# Zombies Per Minute

使用 `React + TypeScript + Vite + Three.js + @react-three/fiber + GSAP` 製作的瀏覽器 3D 遊戲原型。

## 遊戲概念

- 工廠建造與物流連線
- 大量殭屍湧入的生存壓力
- 自動化砲塔防禦
- Roguelite 波次循環
- 以 `ZPM (Zombies Per Minute)` 作為核心表現指標

## 目前內容

- 第三人稱 3D 場景與霧效、地面、主光源 / 背光配置
- 5 波攻防循環：`Assault -> Upgrade -> Build`
- 建築鏈：`Scrap Depot -> Generator -> Ammo Press -> Auto Turret`
- 中文 HUD、升級卡、通知與結算畫面
- 輕量化殭屍渲染與近距離高模 GLB 展示

## 操作

- `WASD`：移動
- 滑鼠：瞄準
- 滑鼠左鍵：射擊
- `R`：裝填
- `Space`：翻滾
- `1-6`：選擇建築
- `L`：連線模式

## 開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
npm run preview

<img width="1908" height="977" alt="image" src="https://github.com/user-attachments/assets/ddf13709-0071-4584-8a8c-a9cb9af214b1" />
<img width="1914" height="980" alt="image" src="https://github.com/user-attachments/assets/9ff1e64e-5711-459e-98b7-17766be578c7" />


```

## 備註

這個版本專注在可展示原型與遊玩迴圈驗證，內容、美術與平衡仍可持續迭代。
