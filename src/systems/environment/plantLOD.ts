import { Matrix4, Mesh, type BufferGeometry, type Material, type Object3D } from 'three'
import type { ManifestLodLevel } from './environmentTypes'

/** One drawable piece of a plant node: a glTF primitive (geometry + material). */
export interface PlantPart {
  readonly geometry: BufferGeometry
  readonly material: Material | Material[]
}

/** The source geometry for one LOD level: one entry per variant node. */
export interface PlantLodSource {
  readonly level: number
  /** variants[slot] = parts of that variant node. A level with one node has a single shared slot. */
  readonly variants: readonly (readonly PlantPart[])[]
}

/**
 * Squared distance thresholds for fast per-frame comparison. thresholdsSq[i] is
 * the upper bound of level i; the last level is unbounded (Infinity).
 */
export interface PlantLodBands {
  readonly levelCount: number
  readonly thresholdsSq: Float64Array
}

export function createLodBands(lod: readonly ManifestLodLevel[]): PlantLodBands {
  const thresholdsSq = new Float64Array(lod.length)
  lod.forEach((level, i) => {
    thresholdsSq[i] = level.maxDistance === null ? Infinity : level.maxDistance * level.maxDistance
  })
  return { levelCount: lod.length, thresholdsSq }
}

/** LOD level for a squared camera distance: level i covers [lod[i - 1].maxDistance, lod[i].maxDistance). */
export function lodLevelForDistanceSq(bands: PlantLodBands, distanceSq: number): number {
  const { thresholdsSq, levelCount } = bands
  for (let i = 0; i < levelCount - 1; i++) {
    if (distanceSq < thresholdsSq[i]) return i
  }
  return levelCount - 1
}

/** Which variant node of a level an instance uses. Single-node levels are shared by all variants. */
export function variantSlot(source: PlantLodSource, variant: number): number {
  return source.variants.length === 1 ? 0 : variant
}

const IDENTITY = new Matrix4()

/**
 * Collects the primitives under a named plant node. GLTFLoader turns a single-primitive
 * mesh into a Mesh and a multi-primitive mesh (e.g. leaf/stem/fruit materials) into a Group of
 * Meshes, so both shapes are handled.
 *
 * Instance matrices replace the node's own transform, so every node on the path must be
 * at identity; anything else would mean the exported matrices and geometry disagree.
 */
function collectParts(nodes: Readonly<Record<string, Object3D>>, name: string): PlantPart[] {
  const node = nodes[name]
  if (!node) throw new Error(`plants.glb has no node named "${name}" (listed in layout.json variantNodes)`)

  const parts: PlantPart[] = []
  node.traverse((object) => {
    if (!object.matrix.equals(IDENTITY)) {
      throw new Error(`plants.glb node "${object.name}" has a non-identity transform; instance matrices expect geometry at the origin`)
    }
    if (object instanceof Mesh) parts.push({ geometry: object.geometry, material: object.material })
  })
  if (parts.length === 0) throw new Error(`plants.glb node "${name}" contains no mesh`)
  return parts
}

/** Resolves layout.json variantNodes against the loaded plants.glb node map. */
export function resolvePlantLodSources(
  nodes: Readonly<Record<string, Object3D>>,
  variantNodes: readonly (readonly string[])[],
): PlantLodSource[] {
  return variantNodes.map((names, level) => ({
    level,
    variants: names.map((name) => collectParts(nodes, name)),
  }))
}
