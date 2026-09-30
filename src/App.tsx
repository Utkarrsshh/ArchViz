import Web3DViewport from './components/scene/Web3DViewport'
import CameraSystemProvider from './systems/camera/CameraSystemProvider'
import './App.css'

function App() {
  return (
    <CameraSystemProvider>
      <main className="app-shell">
        <Web3DViewport />
      </main>
    </CameraSystemProvider>
  )
}

export default App
