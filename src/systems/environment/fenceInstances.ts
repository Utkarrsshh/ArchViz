import { Group, InstancedMesh, Matrix4, Mesh, type Object3D } from 'three'
import type { NodeInstancedSetDefinition } from './environmentTypes'

const IDENTITY = new Matrix4()

function triangleCount(node: Object3D): number {
  let tris = 0
  node.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const { index, attributes } = object.geometry
    tris += (index ? index.count : attributes.position.count) / 3
  })
  return tris
}

function meshesOf(node: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  node.traverse((object) => {
    if (!object.matrix.equals(IDENTITY)) {
      throw new Error(`fence.glb node "${object.name}" has a non-identity transform; instance matrices expect geometry at the origin`)
    }
    if (object instanceof Mesh) meshes.push(object)
  })
  if (meshes.length === 0) throw new Error(`fence.glb node "${node.name}" contains no mesh`)
  return meshes
}

/**
 * Picks the glTF node for a fence set. The manifest names a node and records its
 * triangle count; normally both agree. When they disagree and exactly one of the other
 * manifest-named fence nodes has the recorded triangle count, that node is used and the
 * mismatch is reported. This tolerates exports whose node names were swapped while the
 * matrices and triangle counts stayed consistent; a correct export never triggers it.
 */
function resolveNode(
  set: NodeInstancedSetDefinition,
  sets: readonly NodeInstancedSetDefinition[],
  nodes: Readonly<Record<string, Object3D>>,
  warnings: string[],
): Object3D {
  const named = nodes[set.node]
  if (!named) throw new Error(`fence.glb has no node named "${set.node}" (layout.json instanced.${set.key})`)
  const namedTris = triangleCount(named)
  if (namedTris === set.tris) return named

  const matches = sets
    .map((other) => nodes[other.node])
    .filter((node): node is Object3D => node !== undefined && triangleCount(node) === set.tris)
  if (matches.length === 1) {
    warnings.push(
      `fence ${set.key}: manifest node "${set.node}" has ${namedTris} tris but tris=${set.tris}; using "${matches[0].name}" (${set.tris} tris)`,
    )
    return matches[0]
  }
  warnings.push(`fence ${set.key}: node "${set.node}" has ${namedTris} tris, manifest says ${set.tris}; no unique match, using the named node`)
  return named
}

export interface FenceBuild {
  readonly root: Group
  readonly warnings: readonly string[]
  /** Instances per set key, for validation. */
  readonly counts: Readonly<Record<string, number>>
}

/**
 * Builds one InstancedMesh per glTF primitive per fence set. Matrices are copied verbatim
 * into the instance buffer (no decomposition). Each set spans the site perimeter, so three's
 * per-InstancedMesh bounding sphere (computed once from the instances) handles culling.
 */
export function buildFence(
  sets: readonly NodeInstancedSetDefinition[],
  matrices: Readonly<Record<string, Float32Array>>,
  nodes: Readonly<Record<string, Object3D>>,
): FenceBuild {
  const root = new Group()
  root.name = 'EnvironmentFence'
  root.matrixAutoUpdate = false
  const warnings: string[] = []
  const counts: Record<string, number> = {}

  for (const set of sets) {
    const data = matrices[set.key]
    if (!data || data.length !== set.count * 16) throw new Error(`fence ${set.key}: missing or mis-sized matrix data`)
    const node = resolveNode(set, sets, nodes, warnings)

    const group = new Group()
    // Named after the manifest set so layout.json shadow advice ("fence_panel", ...) applies.
    group.name = set.key
    group.matrixAutoUpdate = false
    root.add(group)

    meshesOf(node).forEach((source, partIndex) => {
      const mesh = new InstancedMesh(source.geometry, source.material, set.count)
      ;(mesh.instanceMatrix.array as Float32Array).set(data)
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.matrixAutoUpdate = false
      mesh.name = `${set.key}_p${partIndex}`
      group.add(mesh)
    })
    counts[set.key] = set.count
  }

  return { root, warnings, counts }
}

export function disposeFence(root: Group): void {
  root.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose()
  })
}
