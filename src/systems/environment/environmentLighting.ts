import { Box3, Matrix4, Vector3 } from 'three'
import type { Vec3Tuple } from '../camera/cameraTypes'
import type { EnvironmentDefinition } from './environmentTypes'

/** Height of the shadow-relevant volume above the site (shell ridge ≈ 8 m). */
const SITE_HEIGHT = 10
/** Distance from the site centre to the light; only direction matters for a sun. */
const LIGHT_DISTANCE = 250

export interface SunRig {
  readonly position: Vec3Tuple
  readonly target: Vec3Tuple
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  readonly near: number
  readonly far: number
}

/**
 * Places a directional light along the exported Blender sun direction (or a default)
 * and fits its orthographic shadow camera tightly around the site footprint, so the
 * shadow map covers the whole environment and nothing else.
 */
export function computeSunRig(definition: EnvironmentDefinition, fallbackDirection: Vec3Tuple): SunRig {
  const direction = new Vector3(...(definition.sun?.direction ?? fallbackDirection)).normalize()
  const { minX, maxX, minZ, maxZ } = definition.siteBounds
  const site = new Box3(new Vector3(minX, 0, minZ), new Vector3(maxX, SITE_HEIGHT, maxZ))
  const center = site.getCenter(new Vector3())
  const position = center.clone().addScaledVector(direction, -LIGHT_DISTANCE)

  // Light view space: the same lookAt three's DirectionalLightShadow uses.
  const view = new Matrix4().lookAt(position, center, new Vector3(0, 1, 0)).setPosition(position).invert()
  const bounds = site.clone().applyMatrix4(view)
  const margin = 2
  return {
    position: position.toArray() as Vec3Tuple,
    target: center.toArray() as Vec3Tuple,
    left: bounds.min.x - margin,
    right: bounds.max.x + margin,
    bottom: bounds.min.y - margin,
    top: bounds.max.y + margin,
    near: Math.max(0.5, -bounds.max.z - margin),
    far: -bounds.min.z + margin,
  }
}
