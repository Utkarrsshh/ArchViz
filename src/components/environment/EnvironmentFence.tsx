import { useEffect, useMemo } from 'react'
import { useEnvironmentGLTF } from '../../systems/environment/environmentAssets'
import { applyShadowAdvice } from '../../systems/environment/environmentShadows'
import type {
  EnvironmentAsset,
  EnvironmentShadowAdvice,
  NodeInstancedSetDefinition,
} from '../../systems/environment/environmentTypes'
import { buildFence, disposeFence } from '../../systems/environment/fenceInstances'

interface EnvironmentFenceProps {
  asset: EnvironmentAsset
  ktx2: boolean
  sets: readonly NodeInstancedSetDefinition[]
  matrices: Readonly<Record<string, Float32Array>>
  shadows: EnvironmentShadowAdvice
  onReady: (usedKtx2: boolean) => void
}

/** Perimeter fence: one InstancedMesh per primitive per manifest set (6 meshes, 515 instances). */
export default function EnvironmentFence({ asset, ktx2, sets, matrices, shadows, onReady }: EnvironmentFenceProps) {
  const { nodes } = useEnvironmentGLTF(asset, ktx2)

  const fence = useMemo(() => {
    const built = buildFence(sets, matrices, nodes)
    applyShadowAdvice(built.root, shadows)
    return built
  }, [sets, matrices, nodes, shadows])

  useEffect(() => {
    for (const warning of fence.warnings) console.warn(`[environment] ${warning}`)
  }, [fence])
  useEffect(() => () => disposeFence(fence.root), [fence])
  useEffect(() => onReady(ktx2), [fence, ktx2, onReady])

  return <primitive object={fence.root} />
}
