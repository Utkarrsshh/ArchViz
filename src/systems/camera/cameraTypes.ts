export type Vec3Tuple = [number, number, number]

/** A named camera destination. Plain data, so it can come from config, a CMS or a GLB's metadata. */
export interface CameraWaypoint {
  readonly id: string
  readonly name: string
  readonly position: Vec3Tuple
  readonly target: Vec3Tuple
  /** Vertical field of view in degrees. Omit to keep the current FOV. */
  readonly fov?: number
  /** Approximate seconds for the move to settle. Omit to use the default. */
  readonly duration?: number
}

/** Axis-aligned box the orbit target is kept inside (limits panning). */
export interface CameraBounds {
  readonly min: Vec3Tuple
  readonly max: Vec3Tuple
}

export interface CameraSettings {
  readonly initialPosition: Vec3Tuple
  readonly initialTarget: Vec3Tuple
  /** Vertical field of view in degrees. */
  readonly initialFov: number
  readonly minFov: number
  readonly maxFov: number
  readonly near: number
  readonly far: number
  readonly minDistance: number
  readonly maxDistance: number
  /** Radians from straight up. */
  readonly minPolarAngle: number
  /** Radians from straight up; keep below PI / 2 to stay above the ground. */
  readonly maxPolarAngle: number
  /** Radians; use -Infinity / Infinity for unrestricted orbiting. */
  readonly minAzimuthAngle: number
  readonly maxAzimuthAngle: number
  readonly targetBounds: CameraBounds | null
  /** Damping (seconds) applied to user orbit/zoom input. */
  readonly smoothTime: number
  /** Damping (seconds) applied while dragging. */
  readonly draggingSmoothTime: number
  /** Default seconds for programmatic moves to settle. */
  readonly defaultTransitionDuration: number
  /** Whether user input is blocked while a programmatic move runs. */
  readonly lockInteractionDuringTransition: boolean
}

export interface CameraMoveOptions {
  readonly fov?: number
  readonly duration?: number
  readonly lockInteraction?: boolean
}

export type CameraMode = 'exploration' | 'transitioning'

/**
 * Public camera API. Contains no Three.js types so UI and feature code stay
 * independent of the renderer. Movement promises resolve `true` when the move
 * completed and `false` when it was rejected, interrupted or stopped.
 */
export interface CameraSystemApi {
  moveToWaypoint(waypoint: CameraWaypoint | string): Promise<boolean>
  moveTo(position: Vec3Tuple, target: Vec3Tuple, options?: CameraMoveOptions): Promise<boolean>
  reset(options?: Omit<CameraMoveOptions, 'fov'>): Promise<boolean>
  /** Halts any movement in place. */
  stop(): void
  setFov(fov: number, options?: Pick<CameraMoveOptions, 'duration'>): void
  setInteractionEnabled(enabled: boolean): void
  getInteractionEnabled(): boolean
  isMoving(): boolean
  getMode(): CameraMode
}

/** A fully resolved movement request passed from the provider to the controller. */
export interface CameraTransitionRequest {
  readonly position: Vec3Tuple
  readonly target: Vec3Tuple
  readonly fov: number | undefined
  readonly duration: number
  readonly lockInteraction: boolean
}

/** Internal contract implemented by the Canvas-side CameraController. */
export interface CameraControllerHandle {
  transition(request: CameraTransitionRequest): Promise<boolean>
  halt(): void
  setFov(fov: number, duration: number): void
  setInteractionEnabled(enabled: boolean): void
  isTransitioning(): boolean
}

export interface CameraRegistry {
  readonly settings: CameraSettings
  /** Registers the active controller; returns the matching unregister function. */
  register(handle: CameraControllerHandle): () => void
}
