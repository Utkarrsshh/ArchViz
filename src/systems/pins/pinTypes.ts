import type { Vec3Tuple } from '../camera/cameraTypes'

/**
 * A clickable point of interest in the scene. Pins only reference a camera
 * waypoint by id; all camera framing lives in the camera configuration.
 */
export interface PropertyPinConfig {
  readonly id: string
  readonly label: string
  /** World-space anchor of the marker. */
  readonly position: Vec3Tuple
  /** Must match a CameraWaypoint id known to CameraSystemProvider. */
  readonly waypointId: string
  readonly description?: string
  /** Defaults to true. */
  readonly enabled?: boolean
}
