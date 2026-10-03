import type { CameraSettings, CameraWaypoint } from '../systems/camera/cameraTypes'

export const CAMERA_SETTINGS: CameraSettings = {
  // Frames the polyhouse environment (site spans x -45..146, z -70..-1).
  initialPosition: [-30, 42, 32],
  initialTarget: [42, 0, -38],
  initialFov: 45,
  minFov: 20,
  maxFov: 90,
  near: 0.1,
  far: 1500,
  minDistance: 4,
  // Blender CAM_SITE orbits from ~277 m; keep headroom so marker framings are not clamped.
  maxDistance: 320,
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI / 2 - 0.05,
  minAzimuthAngle: -Infinity,
  maxAzimuthAngle: Infinity,
  targetBounds: { min: [-60, 0, -90], max: [160, 15, 20] },
  smoothTime: 0.25,
  draggingSmoothTime: 0.125,
  defaultTransitionDuration: 1.5,
  lockInteractionDuringTransition: true,
}

/**
 * Development waypoints, used only when the environment package has no Blender camera
 * markers (layout.json "markers") or fails to load.
 */
export const CAMERA_WAYPOINTS: readonly CameraWaypoint[] = [
  {
    id: 'overview',
    name: 'Overview',
    position: CAMERA_SETTINGS.initialPosition,
    target: CAMERA_SETTINGS.initialTarget,
    fov: CAMERA_SETTINGS.initialFov,
  },
  {
    id: 'front',
    name: 'Front Elevation',
    position: [0, 4.5, 24],
    target: [0, 4, 0],
    fov: 40,
    duration: 1.8,
  },
  {
    id: 'upper',
    name: 'Upper Terrace',
    position: [-12, 16, 11],
    target: [-1.5, 8, -0.5],
    fov: 50,
    duration: 2,
  },
]
