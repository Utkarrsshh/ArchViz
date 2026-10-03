import { createContext, useContext } from 'react'
import type { CameraWaypoint } from '../camera/cameraTypes'
import type { PropertyPinConfig } from '../pins/pinTypes'
import type {
  EnvironmentAssetKey,
  EnvironmentDefinition,
  EnvironmentPart,
  EnvironmentStatus,
  Ktx2PartState,
  PartState,
  PlantInstanceData,
  PlantRenderStats,
} from './environmentTypes'

// Kept separate from EnvironmentSystemProvider.tsx so that file only exports a component (fast refresh).

/**
 * Camera waypoints and pins for the active environment. "blender" when layout.json carries
 * exported markers, "config" when it does not (or failed to load), "pending" until known.
 */
export interface EnvironmentMarkers {
  readonly source: 'pending' | 'blender' | 'config'
  readonly waypoints: readonly CameraWaypoint[]
  readonly pins: readonly PropertyPinConfig[]
}

export interface EnvironmentSystemValue {
  readonly status: EnvironmentStatus
  /** Validated manifest with resolved URLs; null until layout.json has loaded. */
  readonly definition: EnvironmentDefinition | null
  /** Decoded plant binaries; null until loaded (wave 2). */
  readonly plantData: PlantInstanceData | null
  /** Decoded fence matrices by instanced-set key; null until loaded (wave 2). */
  readonly fenceData: Readonly<Record<string, Float32Array>> | null
  /** Mutable render counters written by the plant renderer (debug/diagnostics only). */
  readonly plantStats: PlantRenderStats
  readonly markers: EnvironmentMarkers
  /** Whether a part should try its KTX2 derivative (falls back to PNG on failure). */
  prefersKtx2(asset: EnvironmentAssetKey): boolean
  /** Used by Canvas-side components to report their load state. */
  reportPart(part: Exclude<EnvironmentPart, 'manifest'>, state: PartState, error?: unknown): void
  /** Used by Canvas-side asset loaders to report which texture path was used. */
  reportKtx2(asset: EnvironmentAssetKey, state: Ktx2PartState): void
  /** Transcoder initialised (GPU format families) or failed (null): every waiting asset then uses PNG. */
  reportTranscoder(target: string | null): void
}

export const EnvironmentSystemContext = createContext<EnvironmentSystemValue | null>(null)

/** Environment state for any component inside EnvironmentSystemProvider, in or out of the Canvas. */
export function useEnvironmentSystem(): EnvironmentSystemValue {
  const value = useContext(EnvironmentSystemContext)
  if (!value) throw new Error('useEnvironmentSystem must be used inside <EnvironmentSystemProvider>.')
  return value
}
