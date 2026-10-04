import { Box3, MathUtils, Vector3 } from 'three'
import type { CameraSettings, CameraWaypoint, Vec3Tuple } from '../camera/cameraTypes'
import type { EnvironmentDefinition } from './environmentTypes'

/** Direction from the site centre to the framing camera: elevated, from -X / +Z. */
const SITE_VIEW_DIRECTION = new Vector3(-0.66, 0.39, 0.64).normalize()
/** Panning margin around the site, as a fraction of its ground diagonal. */
const BOUNDS_MARGIN = 0.1
/** Minimum height of the panning box, in metres. */
const MIN_BOUNDS_HEIGHT = 10
/** Headroom so marker framings are never clamped by maxDistance. */
const DISTANCE_HEADROOM = 1.1

function distance(waypoint: CameraWaypoint): number {
  return new Vector3(...waypoint.position).distanceTo(new Vector3(...waypoint.target))
}

/**
 * Fits the scene-dependent camera settings to a loaded package: start/reset view, panning
 * bounds, zoom-out limit and far plane. Behaviour settings (damping, FOV range, polar
 * limits, transitions) are taken from `base` unchanged. See config/camera.ts.
 */
export function fitCameraSettings(
  base: CameraSettings,
  definition: EnvironmentDefinition,
  waypoints: readonly CameraWaypoint[],
  homeWaypointId: string | null,
): CameraSettings {
  const { minX, maxX, minZ, maxZ } = definition.siteBounds
  const diagonal = Math.hypot(maxX - minX, maxZ - minZ)
  const center = new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2)

  const home = homeWaypointId ? waypoints.find((waypoint) => waypoint.id === homeWaypointId) : undefined
  if (homeWaypointId && !home && import.meta.env.DEV) {
    console.warn(`[camera] HOME_CAMERA_ID "${homeWaypointId}" is not a camera marker in layout.json; framing the site.`)
  }

  // Default view: the whole site's ground rectangle inside the vertical field of view.
  const fitDistance = diagonal / 2 / Math.tan(MathUtils.degToRad(base.initialFov) / 2)
  const initialPosition = home?.position ?? (center.clone().addScaledVector(SITE_VIEW_DIRECTION, fitDistance).toArray() as Vec3Tuple)
  const initialTarget = home?.target ?? (center.toArray() as Vec3Tuple)
  const initialFov = home?.fov ?? base.initialFov

  const maxDistance = Math.max(
    base.maxDistance,
    fitDistance * DISTANCE_HEADROOM,
    ...waypoints.map((waypoint) => distance(waypoint) * DISTANCE_HEADROOM),
  )

  let targetBounds = base.targetBounds
  if (!targetBounds) {
    const margin = diagonal * BOUNDS_MARGIN
    const box = new Box3(
      new Vector3(minX - margin, 0, minZ - margin),
      new Vector3(maxX + margin, Math.max(MIN_BOUNDS_HEIGHT, margin), maxZ + margin),
    )
    for (const waypoint of waypoints) box.expandByPoint(new Vector3(...waypoint.target))
    targetBounds = { min: box.min.toArray() as Vec3Tuple, max: box.max.toArray() as Vec3Tuple }
  }

  return {
    ...base,
    initialPosition,
    initialTarget,
    initialFov,
    maxDistance,
    far: Math.max(base.far, (maxDistance + diagonal) * 2),
    targetBounds,
  }
}
