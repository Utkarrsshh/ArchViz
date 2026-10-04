import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type DirectionalLight } from 'three'
import { LIGHTING_CONFIG } from '../../config/lighting'
import { useEnvironmentSystem } from '../../systems/environment/environmentContext'
import { computeSunRig } from '../../systems/environment/environmentLighting'
import type { Vec3Tuple } from '../../systems/camera/cameraTypes'
import EnvironmentScene from '../environment/EnvironmentScene'
import PropertyPinLayer from '../pins/PropertyPinLayer'

const { fallbackSunDirection } = LIGHTING_CONFIG
/** Used until (or unless) an environment is loaded. */
const DEFAULT_SUN_POSITION = fallbackSunDirection.map((v) => -v) as Vec3Tuple

/**
 * Scene-wide lighting: soft sky/ground fill plus a shadow-casting sun. With an environment
 * loaded, the sun follows the exported Blender SUN direction and its shadow camera is fitted
 * to the site footprint. Colours and intensities come from config/lighting.ts.
 */
function SceneLighting() {
  const { definition } = useEnvironmentSystem()
  const lightRef = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const rig = useMemo(
    () => (definition ? computeSunRig(definition, fallbackSunDirection, LIGHTING_CONFIG.shadowVolumeHeight) : null),
    [definition],
  )
  const { hemisphere, shadowMapSize } = LIGHTING_CONFIG

  // Shadow-camera props change after mount, so its projection must be refreshed explicitly.
  useLayoutEffect(() => {
    lightRef.current?.shadow.camera.updateProjectionMatrix()
  }, [rig])

  return (
    <>
      <hemisphereLight args={[hemisphere.skyColor, hemisphere.groundColor, hemisphere.intensity]} />
      <primitive object={target} position={rig?.target ?? [0, 0, 0]} />
      <directionalLight
        ref={lightRef}
        target={target}
        position={rig?.position ?? DEFAULT_SUN_POSITION}
        intensity={LIGHTING_CONFIG.sunIntensity}
        castShadow
        shadow-mapSize={rig ? [shadowMapSize, shadowMapSize] : [2048, 2048]}
        shadow-bias={LIGHTING_CONFIG.shadowBias}
        shadow-normalBias={LIGHTING_CONFIG.shadowNormalBias}
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
 * The environment package supplies its own ground geometry, and pins come from Blender
 * PIN_* markers when the package has them. Camera handling lives in CameraController.
 * Must be rendered inside a Canvas (see Web3DViewport).
 */
export default function ArchVizScene() {
  const { markers } = useEnvironmentSystem()

  return (
    <>
      <color attach="background" args={[LIGHTING_CONFIG.backgroundColor]} />

      <SceneLighting />
      <EnvironmentScene />
      <PropertyPinLayer pins={markers.pins} />
    </>
  )
}
