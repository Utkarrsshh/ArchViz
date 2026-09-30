import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { CAMERA_SETTINGS, CAMERA_WAYPOINTS } from '../../config/camera'
import { CameraRegistryContext, CameraSystemContext } from './cameraContext'
import type {
  CameraControllerHandle,
  CameraMoveOptions,
  CameraRegistry,
  CameraSettings,
  CameraSystemApi,
  CameraTransitionRequest,
  CameraWaypoint,
  Vec3Tuple,
} from './cameraTypes'

interface PendingTransition {
  readonly request: CameraTransitionRequest
  readonly resolve: (completed: boolean) => void
}

interface CameraSystemProviderProps {
  children: ReactNode
  settings?: CameraSettings
  /** Waypoints addressable by id through moveToWaypoint(id). */
  waypoints?: readonly CameraWaypoint[]
}

function warn(message: string): void {
  if (import.meta.env.DEV) console.warn(`[camera] ${message}`)
}

function isVec3(value: Vec3Tuple): boolean {
  return value.length === 3 && value.every(Number.isFinite)
}

function validateMove(
  position: Vec3Tuple,
  target: Vec3Tuple,
  options: CameraMoveOptions,
  settings: CameraSettings,
): string | null {
  if (!isVec3(position)) return 'position must be three finite numbers'
  if (!isVec3(target)) return 'target must be three finite numbers'
  if (position.every((v, i) => v === target[i])) return 'position and target must differ'
  if (options.fov !== undefined && !(options.fov >= settings.minFov && options.fov <= settings.maxFov)) {
    return `fov must be between ${settings.minFov} and ${settings.maxFov}`
  }
  if (options.duration !== undefined && !(options.duration > 0)) return 'duration must be positive'
  return null
}

function validateWaypoints(waypoints: readonly CameraWaypoint[], settings: CameraSettings): void {
  const seen = new Set<string>()
  for (const waypoint of waypoints) {
    if (!waypoint.id) warn(`Waypoint "${waypoint.name}" has an empty id.`)
    if (seen.has(waypoint.id)) warn(`Duplicate waypoint id "${waypoint.id}".`)
    seen.add(waypoint.id)
    const error = validateMove(waypoint.position, waypoint.target, waypoint, settings)
    if (error) warn(`Waypoint "${waypoint.id}": ${error}.`)
  }
}

/**
 * Owns the public camera API. Components outside the Canvas talk to this
 * provider; the Canvas-side CameraController registers itself here and does
 * the actual Three.js work. Commands issued before the controller mounts are
 * queued (latest move wins) rather than dropped.
 */
export default function CameraSystemProvider({
  children,
  settings = CAMERA_SETTINGS,
  waypoints = CAMERA_WAYPOINTS,
}: CameraSystemProviderProps) {
  const controllerRef = useRef<CameraControllerHandle | null>(null)
  const pendingMoveRef = useRef<PendingTransition | null>(null)
  const pendingFovRef = useRef<{ fov: number; duration: number } | null>(null)
  const interactionEnabledRef = useRef(true)

  useEffect(() => {
    if (import.meta.env.DEV) validateWaypoints(waypoints, settings)
  }, [waypoints, settings])

  const registry = useMemo<CameraRegistry>(
    () => ({
      settings,
      register(handle) {
        controllerRef.current = handle
        handle.setInteractionEnabled(interactionEnabledRef.current)

        const pendingFov = pendingFovRef.current
        pendingFovRef.current = null
        if (pendingFov) handle.setFov(pendingFov.fov, pendingFov.duration)

        const pendingMove = pendingMoveRef.current
        pendingMoveRef.current = null
        if (pendingMove) void handle.transition(pendingMove.request).then(pendingMove.resolve)

        return () => {
          if (controllerRef.current === handle) controllerRef.current = null
        }
      },
    }),
    [settings],
  )

  const api = useMemo<CameraSystemApi>(() => {
    const waypointsById = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint]))

    const cancelPendingMove = () => {
      pendingMoveRef.current?.resolve(false)
      pendingMoveRef.current = null
    }

    const moveTo: CameraSystemApi['moveTo'] = (position, target, options = {}) => {
      const error = validateMove(position, target, options, settings)
      if (error) {
        warn(`Ignored camera move: ${error}.`)
        return Promise.resolve(false)
      }
      const request: CameraTransitionRequest = {
        position,
        target,
        fov: options.fov,
        duration: options.duration ?? settings.defaultTransitionDuration,
        lockInteraction: options.lockInteraction ?? settings.lockInteractionDuringTransition,
      }
      const controller = controllerRef.current
      if (controller) return controller.transition(request)

      cancelPendingMove()
      return new Promise<boolean>((resolve) => {
        pendingMoveRef.current = { request, resolve }
      })
    }

    return {
      moveTo,

      moveToWaypoint(waypointOrId) {
        const waypoint =
          typeof waypointOrId === 'string' ? waypointsById.get(waypointOrId) : waypointOrId
        if (!waypoint) {
          warn(`Unknown waypoint id "${String(waypointOrId)}".`)
          return Promise.resolve(false)
        }
        return moveTo(waypoint.position, waypoint.target, waypoint)
      },

      reset(options = {}) {
        return moveTo(settings.initialPosition, settings.initialTarget, {
          ...options,
          fov: settings.initialFov,
        })
      },

      stop() {
        cancelPendingMove()
        controllerRef.current?.halt()
      },

      setFov(fov, options = {}) {
        const duration = options.duration ?? settings.defaultTransitionDuration
        if (!(fov >= settings.minFov && fov <= settings.maxFov) || !(duration > 0)) {
          warn(`Ignored setFov(${fov}): out of range or invalid duration.`)
          return
        }
        const controller = controllerRef.current
        if (controller) controller.setFov(fov, duration)
        else pendingFovRef.current = { fov, duration }
      },

      setInteractionEnabled(enabled) {
        interactionEnabledRef.current = enabled
        controllerRef.current?.setInteractionEnabled(enabled)
      },

      getInteractionEnabled: () => interactionEnabledRef.current,

      isMoving: () => controllerRef.current?.isTransitioning() ?? false,

      getMode: () => (controllerRef.current?.isTransitioning() ? 'transitioning' : 'exploration'),
    }
  }, [settings, waypoints])

  return (
    <CameraRegistryContext value={registry}>
      <CameraSystemContext value={api}>{children}</CameraSystemContext>
    </CameraRegistryContext>
  )
}
