import EnvironmentStatus from './components/environment/EnvironmentStatus'
import Web3DViewport from './components/scene/Web3DViewport'
import EnvironmentCameraSystem from './systems/environment/EnvironmentCameraSystem'
import EnvironmentSystemProvider from './systems/environment/EnvironmentSystemProvider'
import './App.css'

// The environment loads first so its Blender camera markers can feed the camera system.
function App() {
  return (
    <EnvironmentSystemProvider>
      <EnvironmentCameraSystem>
        <main className="app-shell">
          <Web3DViewport />
          <EnvironmentStatus />
        </main>
      </EnvironmentCameraSystem>
    </EnvironmentSystemProvider>
  )
}

export default App
