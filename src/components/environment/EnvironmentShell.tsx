import { useEffect } from 'react'
import { Mesh, MeshPhysicalMaterial, type Material, type Object3D } from 'three'
import { useEnvironmentGLTF } from '../../systems/environment/environmentAssets'
import { applyShadowAdvice } from '../../systems/environment/environmentShadows'
import type { EnvironmentAsset, EnvironmentShadowAdvice } from '../../systems/environment/environmentTypes'

interface EnvironmentShellProps {
  asset: EnvironmentAsset
  ktx2: boolean
  shadows: EnvironmentShadowAdvice
  onReady: (usedKtx2: boolean) => void
}

function logShellSummary(scene: Object3D, ktx2: boolean): void {
  let meshes = 0
  const transmissive = new Set<string>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    meshes++
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (material instanceof MeshPhysicalMaterial && material.transmission > 0) {
        transmissive.add(`${material.name} (transmission ${material.transmission.toFixed(2)})`)
      }
    }
  })
  console.info(
    `[environment] shell (${ktx2 ? 'KTX2' : 'PNG'}): ${meshes} meshes; KHR_materials_transmission → ${[...transmissive].join(', ') || 'none'}`,
  )
}

/**
 * The static polyhouse shell, rendered exactly as exported: node transforms,
 * embedded textures and glTF material extensions are used as GLTFLoader produces them.
 */
export default function EnvironmentShell({ asset, ktx2, shadows, onReady }: EnvironmentShellProps) {
  const { scene } = useEnvironmentGLTF(asset, ktx2)

  useEffect(() => {
    applyShadowAdvice(scene, shadows)
    if (import.meta.env.DEV) logShellSummary(scene, ktx2)
    onReady(ktx2)
  }, [scene, shadows, ktx2, onReady])

  return <primitive object={scene} />
}
