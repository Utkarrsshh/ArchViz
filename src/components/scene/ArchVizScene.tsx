import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type DirectionalLight } from 'three'
import { useEnvironmentSystem } from '../../systems/environment/environmentContext'
import { computeSunRig } from '../../systems/environment/environmentLighting'
import type { Vec3Tuple } from '../../systems/camera/cameraTypes'
import EnvironmentScene from '../environment/EnvironmentScene'
import PropertyPinLayer from '../pins/PropertyPinLayer'

const SKY_COLOR = '#dfe6ec'
/** Used until (or unless) the environment provides its Blender sun direction. */
const DEFAULT_SUN_POSITION: Vec3Tuple = [18, 28, 12]
const DEFAULT_SUN_DIRECTION: Vec3Tuple = [-18, -28, -12]

/**
 * Scene-wide lighting: soft sky/ground fill plus a shadow-casting sun. With an environment
 * loaded, the sun follows the exported Blender SUN direction and its shadow camera is fitted
 * to the site footprint.
 */
function SceneLighting() {
  const { definition } = useEnvironmentSystem()
  const lightRef = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const rig = useMemo(() => (definition ? computeSunRig(definition, DEFAULT_SUN_DIRECTION) : null), [definition])

  // Shadow-camera props change after mount, so its projection must be refreshed explicitly.
  useLayoutEffect(() => {
    lightRef.current?.shadow.camera.updateProjectionMatrix()
  }, [rig])

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8d8a82', 0.9]} />
      <primitive object={target} position={rig?.target ?? [0, 0, 0]} />
      <directionalLight
        ref={lightRef}
        target={target}
        position={rig?.position ?? DEFAULT_SUN_POSITION}
        intensity={2.2}
        castShadow
        shadow-mapSize={rig ? [4096, 4096] : [2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
        shadow-camera-left={rig?.left ?? -25}
        shadow-camera-right={rig?.right ?? 25}
        shadow-camera-top={rig?.top ?? 25}
        shadow-camera-bottom={rig?.bottom ?? -25}
        shadow-camera-near={rig?.near ?? 1}
        shadow-camera-far={rig?.far ?? 80}
      />
    </>
  )
}

/**
 * Root 3D scene contents: background, lighting, the loaded environment and pins.
 * The environment package supplies its own ground (shell__PH_Ground), and pins come from
 * Blender PIN_* markers when the package has them. Camera handling lives in CameraController.
 * Must be rendered inside a Canvas (see Web3DViewport).
 */
export default function ArchVizScene() {
  const { markers } = useEnvironmentSystem()

  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />

      <SceneLighting />
      <EnvironmentScene />
      <PropertyPinLayer pins={markers.pins} />
    </>
  )
}
