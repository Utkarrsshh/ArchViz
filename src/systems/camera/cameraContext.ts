import { createContext, useContext } from 'react'
import type { CameraRegistry, CameraSettings, CameraSystemApi } from './cameraTypes'

// Kept separate from CameraSystemProvider.tsx so that file only exports a component (fast refresh).

export const CameraSystemContext = createContext<CameraSystemApi | null>(null)
export const CameraRegistryContext = createContext<CameraRegistry | null>(null)

/** Public camera API for any component inside CameraSystemProvider, in or out of the Canvas. */
export function useCameraSystem(): CameraSystemApi {
  const api = useContext(CameraSystemContext)
  if (!api) throw new Error('useCameraSystem must be used inside <CameraSystemProvider>.')
  return api
}

/** Internal: used by CameraController to register itself. */
export function useCameraRegistry(): CameraRegistry {
  const registry = useContext(CameraRegistryContext)
  if (!registry) throw new Error('CameraController must be rendered inside <CameraSystemProvider>.')
  return registry
}

export function useCameraSettings(): CameraSettings {
  return useCameraRegistry().settings
}
