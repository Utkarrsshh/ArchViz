import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useEnvironmentGLTF } from '../../systems/environment/environmentAssets'
import type {
  EnvironmentAsset,
  EnvironmentCell,
  EnvironmentShadowAdvice,
  PlantInstanceData,
  PlantRenderStats,
  PlantSetDefinition,
} from '../../systems/environment/environmentTypes'
import { preparePlantCardSources } from '../../systems/environment/plantCardMaterials'
import { resolvePlantLodSources } from '../../systems/environment/plantLOD'
import { PlantCellManager } from '../../systems/environment/spatialCulling'

interface EnvironmentPlantsProps {
  asset: EnvironmentAsset
  ktx2: boolean
  plants: PlantSetDefinition
  cells: readonly EnvironmentCell[]
  data: PlantInstanceData
  stats: PlantRenderStats
  shadows: EnvironmentShadowAdvice
  onReady: (usedKtx2: boolean) => void
}

/**
 * LOD levels allowed to cast shadows: those that can be within castPlantsWithin metres of
 * the camera. Level 0 (full detail, the heaviest geometry) is always excluded: casting it
 * would add the entire near field's full-detail geometry to the shadow pass again.
 */
function shadowCastLevels(plants: PlantSetDefinition, shadows: EnvironmentShadowAdvice): Set<number> {
  const within = shadows.castPlantsWithin
  const levels = new Set<number>()
  if (within === null) return levels
  plants.lod.forEach((level, i) => {
    const lowerBound = i === 0 ? 0 : (plants.lod[i - 1].maxDistance ?? Infinity)
    if (lowerBound < within && i > 0) levels.add(level.level)
  })
  return levels
}

/**
 * All instanced plants as a single primitive: the PlantCellManager owns one Group per
 * spatial cell and a handful of InstancedMeshes per cell. React only mounts the root.
 */
export default function EnvironmentPlants({
  asset,
  ktx2,
  plants,
  cells,
  data,
  stats,
  shadows,
  onReady,
}: EnvironmentPlantsProps) {
  const { nodes } = useEnvironmentGLTF(asset, ktx2)

  const manager = useMemo(() => {
    const sources = preparePlantCardSources(resolvePlantLodSources(nodes, plants.variantNodes))
    const created = new PlantCellManager(cells, data, sources, plants.lod, stats)
    created.setShadows(shadowCastLevels(plants, shadows), true)
    return created
  }, [cells, data, nodes, plants, stats, shadows])

  useEffect(() => () => manager.dispose(), [manager])
  useEffect(() => onReady(ktx2), [manager, ktx2, onReady])

  useFrame(({ camera }) => manager.update(camera))

  return <primitive object={manager.root} />
}
