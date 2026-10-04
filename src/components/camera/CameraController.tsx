import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { useCameraRegistry } from '../../systems/camera/cameraContext'
import type { CameraControllerHandle } from '../../systems/camera/cameraTypes'

/**
 * CameraControls uses critically damped smoothing, which is ~98% settled after
 * 3 × smoothTime. Dividing a requested duration by this makes "duration" mean
 * "roughly when the move looks finished". FOV uses exponential damping, which
 * reaches the same ~98% after 4 / lambda seconds.
 */
const SMOOTH_TIME_PER_DURATION = 3
const FOV_DAMPING_PER_DURATION = 4
const FOV_EPSILON = 0.01

/**
 * Canvas-side half of the camera system. Owns the CameraControls instance and
 * implements the controller handle that CameraSystemProvider forwards to.
 */
export default function CameraController() {
  const { settings, register } = useCameraRegistry()
  // Subscribed so the controller re-initialises if the default camera is replaced.
  const camera = useThree((state) => state.camera)
  const getThreeState = useThree((state) => state.get)
  const controlsRef = useRef<CameraControlsImpl>(null)

  const transitionIdRef = useRef(0)
  const transitioningRef = useRef(false)
  const lockedRef = useRef(false)
  const userInteractionRef = useRef(true)
  const fovTargetRef = useRef<number | null>(null)
  const fovDampingRef = useRef(0)

  // Camera-controls has no FOV transition, so FOV is damped here; idle frames exit immediately.
  useFrame(({ camera }, delta) => {
    const targetFov = fovTargetRef.current
    if (targetFov === null || !(camera instanceof PerspectiveCamera)) return
    const next = MathUtils.damp(camera.fov, targetFov, fovDampingRef.current, delta)
    const settled = Math.abs(next - targetFov) < FOV_EPSILON
    camera.fov = settled ? targetFov : next
    camera.updateProjectionMatrix()
    if (settled) fovTargetRef.current = null
  })

  const finishTransition = useCallback(() => {
    const controls = controlsRef.current
    transitioningRef.current = false
    lockedRef.current = false
    if (!controls) return
    controls.smoothTime = settings.smoothTime
    controls.enabled = userInteractionRef.current
  }, [settings])

  // A user drag during an unlocked transition hands control back to the user.
  const handleControlStart = useCallback(() => {
    if (!transitioningRef.current) return
    transitionIdRef.current += 1
    finishTransition()
  }, [finishTransition])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const [px, py, pz] = settings.initialPosition
    const [tx, ty, tz] = settings.initialTarget
    void controls.setLookAt(px, py, pz, tx, ty, tz, false)
    controls.smoothTime = settings.smoothTime
    controls.draggingSmoothTime = settings.draggingSmoothTime
    const bounds = settings.targetBounds
    controls.setBoundary(
      bounds ? new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)) : undefined,
    )
    // Canvas only applies its camera props once; later settings (fitted to the loaded
    // environment) reach the camera here.
    const initialCamera = getThreeState().camera
    if (initialCamera instanceof PerspectiveCamera) {
      initialCamera.fov = settings.initialFov
      initialCamera.near = settings.near
      initialCamera.far = settings.far
      initialCamera.updateProjectionMatrix()
    }
    fovTargetRef.current = null

    const setFov = (fov: number, duration: number) => {
      fovDampingRef.current = FOV_DAMPING_PER_DURATION / duration
      fovTargetRef.current = fov
    }

    const handle: CameraControllerHandle = {
      async transition({ position, target, fov, duration, lockInteraction }) {
        const id = ++transitionIdRef.current
        transitioningRef.current = true
        lockedRef.current = lockInteraction
        controls.smoothTime = duration / SMOOTH_TIME_PER_DURATION
        controls.enabled = userInteractionRef.current && !lockInteraction
        if (fov !== undefined) setFov(fov, duration)

        await controls.setLookAt(...position, ...target, true)

        // A newer command, stop() or user input superseded this move.
        if (id !== transitionIdRef.current) return false
        finishTransition()
        return true
      },

      halt() {
        transitionIdRef.current += 1
        const position = controls.getPosition(new Vector3(), false)
        const target = controls.getTarget(new Vector3(), false)
        void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false)
        fovTargetRef.current = null
        finishTransition()
      },

      setFov,

      setInteractionEnabled(enabled) {
        userInteractionRef.current = enabled
        if (!lockedRef.current) controls.enabled = enabled
      },

      isTransitioning: () => transitioningRef.current,
    }

    const unregister = register(handle)
    return () => {
      transitionIdRef.current += 1
      transitioningRef.current = false
      lockedRef.current = false
      unregister()
    }
  }, [camera, getThreeState, settings, register, finishTransition])

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      minDistance={settings.minDistance}
      maxDistance={settings.maxDistance}
      minPolarAngle={settings.minPolarAngle}
      maxPolarAngle={settings.maxPolarAngle}
      minAzimuthAngle={settings.minAzimuthAngle}
      maxAzimuthAngle={settings.maxAzimuthAngle}
      onControlStart={handleControlStart}
    />
  )
}
