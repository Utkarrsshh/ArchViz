import { useEffect } from 'react'
import { useEnvironmentGLTF } from '../../systems/environment/environmentAssets'
import { applyShadowAdvice } from '../../systems/environment/environmentShadows'
import type { EnvironmentAsset, EnvironmentShadowAdvice } from '../../systems/environment/environmentTypes'

interface EnvironmentPropsProps {
  asset: EnvironmentAsset
  ktx2: boolean
  shadows: EnvironmentShadowAdvice
  onReady: (usedKtx2: boolean) => void
}

/**
 * The props GLB holds unique, already-placed static meshes. There is no repeated-asset
 * metadata to instance, so the GLB is rendered as exported (repeated parts belong in an
 * instanced set instead).
 */
export default function EnvironmentProps({ asset, ktx2, shadows, onReady }: EnvironmentPropsProps) {
  const { scene } = useEnvironmentGLTF(asset, ktx2)

  useEffect(() => {
    applyShadowAdvice(scene, shadows)
    onReady(ktx2)
  }, [scene, shadows, ktx2, onReady])

  return <primitive object={scene} />
}
