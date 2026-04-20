import './App.css'
import { GameOverlays } from './game/Overlay'
import { GameViewport } from './game/Scene'

function App() {
  return (
    <main className="app-shell">
      <GameViewport />
      <GameOverlays />
    </main>
  )
}

export default App
