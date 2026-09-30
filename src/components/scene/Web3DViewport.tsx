import { Canvas } from '@react-three/fiber'
import CameraController from '../camera/CameraController'
import { useCameraSettings } from '../../systems/camera/cameraContext'
import ArchVizScene from './ArchVizScene'

/**
 * Owns the WebGL surface: Canvas, renderer, pixel ratio and default camera.
 * Scene contents live in ArchVizScene; application UI belongs outside this component.
 */
export default function Web3DViewport() {
  const { initialPosition, initialFov, near, far } = useCameraSettings()

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: initialPosition, fov: initialFov, near, far }}
    >
      <CameraController />
      <ArchVizScene />
    </Canvas>
  )
}
