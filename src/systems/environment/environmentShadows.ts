import { Mesh, PropertyBinding, type Material, type Object3D } from 'three'
import type { EnvironmentShadowAdvice } from './environmentTypes'

type ShadowRole = 'cast' | 'receiveOnly' | 'neither'

function isTransmissive(material: Material | Material[]): boolean {
  const materials = Array.isArray(material) ? material : [material]
  return materials.some((m) => 'transmission' in m && (m as { transmission: number }).transmission > 0)
}

/**
 * Applies layout.json's advisory shadow lists to a loaded GLB (or instanced-set root).
 *
 * Names are matched against the mesh and its ancestors (GLTFLoader puts multi-primitive
 * nodes in a Group), comparing sanitized names because three.js sanitizes node names
 * (e.g. "props__entrance platform" becomes "props__entrance_platform").
 *
 *   cast         → casts and receives
 *   receiveOnly  → receives only
 *   neither      → no shadows
 *   unlisted     → receives only (safe default: never adds shadow-pass cost)
 *
 * Transmissive materials (KHR_materials_transmission film) never cast: three.js shadow
 * maps are binary, so an 85 %-transmissive film would black out everything beneath it.
 */
export function applyShadowAdvice(root: Object3D, advice: EnvironmentShadowAdvice): void {
  const roles = new Map<string, ShadowRole>()
  const add = (names: ReadonlySet<string>, role: ShadowRole) => {
    for (const name of names) roles.set(PropertyBinding.sanitizeNodeName(name), role)
  }
  add(advice.cast, 'cast')
  add(advice.receiveOnly, 'receiveOnly')
  add(advice.neither, 'neither')

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    let role: ShadowRole | undefined
    for (let node: Object3D | null = object; node && !role; node = node.parent) {
      role = roles.get(PropertyBinding.sanitizeNodeName(node.name))
    }
    object.castShadow = role === 'cast' && !isTransmissive(object.material)
    object.receiveShadow = role !== 'neither'
  })
}
