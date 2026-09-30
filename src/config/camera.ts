import type { CameraSettings, CameraWaypoint } from '../systems/camera/cameraTypes'

export const CAMERA_SETTINGS: CameraSettings = {
  initialPosition: [18, 12, 22],
  initialTarget: [0, 3, 0],
  initialFov: 45,
  minFov: 20,
  maxFov: 90,
  near: 0.1,
  far: 500,
  minDistance: 4,
  maxDistance: 60,
  minPolarAngle: 0.05,
  maxPolarAngle: Math.PI / 2 - 0.05,
  minAzimuthAngle: -Infinity,
  maxAzimuthAngle: Infinity,
  targetBounds: { min: [-30, 0, -30], max: [30, 12, 30] },
  smoothTime: 0.25,
  draggingSmoothTime: 0.125,
  defaultTransitionDuration: 1.5,
  lockInteractionDuringTransition: true,
}

/** Development waypoints for the placeholder building. Replace per project. */
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
