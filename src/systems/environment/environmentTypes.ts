/**
 * Types for the WebArchViz environment package (layout.json, schema "webarchviz-layout/1").
 * The manifest types mirror the exporter's JSON exactly; the resolved types below are
 * what the runtime works with after validation and path resolution.
 */

import type { CameraWaypoint, Vec3Tuple } from '../camera/cameraTypes'
import type { PropertyPinConfig } from '../pins/pinTypes'

export type Vec2Tuple = [number, number]

// ---------------------------------------------------------------------------
// Raw manifest (layout.json)
// ---------------------------------------------------------------------------

export interface ManifestLodLevel {
  readonly level: number
  /** Upper bound in metres from the camera; null for the last (unbounded) level. */
  readonly maxDistance: number | null
  readonly tris: number
}

/** An instanced set whose instances pick one of several variant nodes per LOD (plants). */
export interface ManifestVariantInstancedSet {
  readonly glb: string
  readonly count: number
  /** Floats per instance in the matrices file (16 = one 4x4 matrix). */
  readonly stride: number
  readonly matrices: string
  /** One uint8 per instance selecting the variant node, in matrix order. */
  readonly variants: string
  /** variantNodes[lod][variant] = glTF node name. A level with one node is shared by all variants. */
  readonly variantNodes: readonly (readonly string[])[]
  readonly lod: readonly ManifestLodLevel[]
  readonly fadeMetres?: number
  readonly lodNote?: string
}

/** An instanced set drawn from a single node (fence parts; Part 2). */
export interface ManifestNodeInstancedSet {
  readonly glb: string
  readonly node: string
  readonly count: number
  readonly matrices: string
  readonly tris: number
}

export type ManifestInstancedSet = ManifestVariantInstancedSet | ManifestNodeInstancedSet

/**
 * A spatial cell. min/max are on the Blender ground plane (X, Y), so in glTF
 * Y-up space they cover x = [min[0], max[0]] and z = [-max[1], -min[1]].
 */
export interface ManifestCell {
  readonly id: number
  /** First instance index; cells are contiguous, non-overlapping ranges in matrix order. */
  readonly start: number
  readonly count: number
  readonly min: Vec2Tuple
  readonly max: Vec2Tuple
}

export interface EnvironmentManifest {
  readonly schema: string
  readonly units: string
  readonly upAxis: string
  readonly matrixOrder?: string
  readonly warning?: string
  readonly site: {
    readonly min: Vec2Tuple
    readonly max: Vec2Tuple
    readonly grid: Vec2Tuple
    readonly cellSize: Vec2Tuple
  }
  readonly scene: {
    readonly shell: string
    readonly plants: string
    readonly fence?: string
    readonly props?: string
  }
  readonly instanced: Readonly<Record<string, ManifestInstancedSet>>
  /** Advisory shadow assignments by glTF node name. */
  readonly shadows?: ManifestShadows
  readonly cells: readonly ManifestCell[]
  readonly package?: {
    readonly name?: string
    readonly version?: string
    readonly generated?: string
    readonly generator?: string
  }
  readonly textures?: { readonly embedded?: boolean; readonly sourceFolder?: string }
  readonly runtimeNotes?: readonly string[]
  /** Derived optimized assets (scripts/optimize-environment-textures.mjs). */
  readonly optimized?: {
    readonly ktx2?: Readonly<Partial<Record<EnvironmentAssetKey, string>>> & { readonly note?: string }
  }
  /** Blender CAM_* / PIN_* markers (tools/blender/export_webarchviz_markers.py). */
  readonly markers?: ManifestMarkers
  readonly lighting?: { readonly sun?: ManifestSun }
}

export interface ManifestShadows {
  readonly cast?: readonly string[]
  /** Plants within this many metres of the camera may cast shadows. */
  readonly castPlantsWithin?: number
  readonly receiveOnly?: readonly string[]
  readonly neither?: readonly string[]
}

/** A Blender CAM_* marker, already in glTF space and shaped like CameraWaypoint. */
export interface ManifestCameraMarker {
  readonly id: string
  /** Optional; defaults to the linked pin's label. */
  readonly name?: string
  /** Pin this camera belongs to. */
  readonly pinId?: string
  readonly blenderObject?: string
  readonly position: Vec3Tuple
  readonly target: Vec3Tuple
  readonly fov?: number
  readonly duration?: number
  readonly targetDistance?: number
  readonly targetSource?: string
}

/** A Blender PIN_* marker, already in glTF space and shaped like PropertyPinConfig. */
export interface ManifestPinMarker {
  readonly id: string
  readonly label: string
  readonly placement?: string
  readonly blenderObject?: string
  readonly position: Vec3Tuple
  readonly waypointId: string
  readonly description?: string
  readonly enabled?: boolean
}

export interface ManifestMarkers {
  /** Always glTF Y-up metres: Blender (x, y, z) -> (x, z, -y), already applied. */
  readonly coordinateSpace?: string
  readonly note?: string
  readonly cameraMarkers: readonly ManifestCameraMarker[]
  readonly pinMarkers: readonly ManifestPinMarker[]
}

export interface ManifestSun {
  readonly object?: string
  /** Direction the light travels, glTF space, normalised. */
  readonly direction: Vec3Tuple
  readonly strength?: number
  readonly angle?: number
}

// ---------------------------------------------------------------------------
// Resolved runtime definition
// ---------------------------------------------------------------------------

/** A cell converted to glTF Y-up world space (ground-plane rectangle only; heights come from geometry). */
export interface EnvironmentCell {
  readonly id: number
  readonly start: number
  readonly count: number
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export interface PlantSetDefinition {
  /** Key of the set inside manifest.instanced. */
  readonly key: string
  readonly count: number
  readonly stride: number
  readonly glbUrl: string
  readonly matricesUrl: string
  readonly variantsUrl: string
  readonly variantNodes: readonly (readonly string[])[]
  /** Sorted by level; the last entry has maxDistance === null. */
  readonly lod: readonly ManifestLodLevel[]
  /** Exported cross-fade width. Parsed and kept; Part 1 uses hard LOD switches. */
  readonly fadeMetres: number | null
}

/** A single-node instanced set (fence parts). */
export interface NodeInstancedSetDefinition {
  readonly key: string
  /** glTF node named by the manifest. */
  readonly node: string
  readonly count: number
  /** Triangle count recorded by the exporter, used to cross-check the node. */
  readonly tris: number
  readonly matricesUrl: string
}

export type EnvironmentAssetKey = 'shell' | 'plants' | 'fence' | 'props'

/** A GLB with its PNG-embedded original and optional KTX2-optimized derivative. */
export interface EnvironmentAsset {
  readonly url: string
  readonly ktx2Url: string | null
}

export interface EnvironmentShadowAdvice {
  readonly cast: ReadonlySet<string>
  readonly receiveOnly: ReadonlySet<string>
  readonly neither: ReadonlySet<string>
  readonly castPlantsWithin: number | null
}

export interface EnvironmentDefinition {
  /** Directory URL every manifest path resolves against, ending in "/". */
  readonly baseUrl: string
  readonly manifest: EnvironmentManifest
  readonly shellUrl: string
  readonly plants: PlantSetDefinition
  readonly cells: readonly EnvironmentCell[]
  readonly assets: Readonly<Record<EnvironmentAssetKey, EnvironmentAsset | null>>
  readonly fence: readonly NodeInstancedSetDefinition[]
  /** null when the manifest has no "markers" (pre-marker exports). */
  readonly markers: { readonly cameras: readonly CameraWaypoint[]; readonly pins: readonly PropertyPinConfig[] } | null
  readonly sun: ManifestSun | null
  readonly shadows: EnvironmentShadowAdvice
  /** Site ground rectangle in glTF space. */
  readonly siteBounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
}

/** Decoded plant binaries. Matrices are column-major, ready for InstancedMesh. */
export interface PlantInstanceData {
  readonly count: number
  /** count * 16 floats; instance i occupies [i * 16, i * 16 + 16). */
  readonly matrices: Float32Array
  /** One variant index per instance, same order as matrices. */
  readonly variants: Uint8Array
}

// ---------------------------------------------------------------------------
// Loading status and render statistics
// ---------------------------------------------------------------------------

export type EnvironmentPart = 'manifest' | 'shell' | 'plants' | 'fence' | 'props'
export type PartState = 'idle' | 'loading' | 'ready' | 'error'
export type EnvironmentPhase = 'loading' | 'ready' | 'error'

/** Which loading wave is active: 1 shell, 2 vegetation + structures, 3 props. */
export type EnvironmentWave = 0 | 1 | 2 | 3

export type Ktx2PartState = 'pending' | 'ktx2' | 'png' | 'fallback'

export interface Ktx2Status {
  /** Whether KTX2 was allowed for this session (manifest entry, files present, not disabled by ?ktx2=0). */
  readonly enabled: boolean
  readonly reason: string
  /** Compressed GPU format family chosen by KTX2Loader, once known. */
  readonly transcodeTarget: string | null
  readonly parts: Readonly<Partial<Record<EnvironmentAssetKey, Ktx2PartState>>>
}

export interface EnvironmentStatus {
  readonly phase: EnvironmentPhase
  readonly wave: EnvironmentWave
  readonly parts: Readonly<Record<EnvironmentPart, PartState>>
  /** First critical error (layout or shell). */
  readonly error: string | null
  /** Non-critical failures (plants, fence, props). */
  readonly warnings: readonly string[]
  /** ms from provider mount to each part settling. */
  readonly timings: Readonly<Partial<Record<EnvironmentPart, number>>>
  readonly ktx2: Ktx2Status
}

/** Mutable counters written by the plant renderer every frame; read by debug UI. */
export interface PlantRenderStats {
  totalInstances: number
  totalCells: number
  visibleCells: number
  /** Cells currently classified per instance because they straddle a LOD boundary. */
  mixedCells: number
  /** Instances submitted per LOD level for visible cells. */
  instancesPerLod: number[]
  /** InstancedMesh draws submitted (non-empty, visible meshes). */
  drawCalls: number
  instancedMeshes: number
}
