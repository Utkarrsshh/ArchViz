import type { CameraSettings, CameraWaypoint } from '../systems/camera/cameraTypes'

/**
 * Scene-agnostic camera behaviour. Once layout.json has loaded, the scene-dependent values
 * are fitted to the package (systems/environment/environmentCamera.ts):
 *
 *   initialPosition / initialTarget  HOME_CAMERA_ID's marker, else a framing of layout.json "site"
 *   targetBounds                     the site plus a margin and every marker target (when null here)
 *   maxDistance / far                raised as needed so the site and every marker fit
 *
 * The values below apply until then, and when no package loads.
 */
export const CAMERA_SETTINGS: CameraSettings = {
  initialPosition: [-30, 20, 30],
  initialTarget: [0, 0, 0],
  initialFov: 45,
  minFov: 20,
  maxFov: 90,
  near: 0.1,
  far: 1500,
  minDistance: 4,
  maxDistance: 300,
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI / 2 - 0.05,
  minAzimuthAngle: -Infinity,
  maxAzimuthAngle: Infinity,
  // null: derived from the package. Set a box here to pin the panning limits by hand.
  targetBounds: null,
  smoothTime: 0.25,
  draggingSmoothTime: 0.125,
  defaultTransitionDuration: 1.5,
  lockInteractionDuringTransition: true,
}

/**
 * Blender camera marker (layout.json cameraMarkers[].id, e.g. "cam-home") used as the start
 * view and the reset() target. null frames the whole site instead.
 */
export const HOME_CAMERA_ID: string | null = null

/**
 * Fallback waypoints, used only when the environment package has no Blender camera
 * markers (layout.json "markers") or fails to load. Project cameras come from Blender
 * CAM_* markers; leave this empty unless a project deliberately ships without markers.
 */
export const CAMERA_WAYPOINTS: readonly CameraWaypoint[] = []
