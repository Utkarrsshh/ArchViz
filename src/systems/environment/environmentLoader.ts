import type { CameraWaypoint, Vec3Tuple } from '../camera/cameraTypes'
import type { PropertyPinConfig } from '../pins/pinTypes'
import type {
  EnvironmentAsset,
  EnvironmentAssetKey,
  EnvironmentCell,
  EnvironmentDefinition,
  EnvironmentManifest,
  EnvironmentShadowAdvice,
  ManifestCell,
  ManifestLodLevel,
  ManifestSun,
  ManifestVariantInstancedSet,
  NodeInstancedSetDefinition,
  PlantSetDefinition,
} from './environmentTypes'

const SUPPORTED_SCHEMA = 'webarchviz-layout/1'

export class EnvironmentManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvironmentManifestError'
  }
}

function fail(message: string): never {
  throw new EnvironmentManifestError(`layout.json: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} must be an object`)
  return value
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string`)
  return value
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a finite number`)
  return value
}

function expectCount(value: unknown, path: string): number {
  const n = expectNumber(value, path)
  if (!Number.isInteger(n) || n < 0) fail(`${path} must be a non-negative integer`)
  return n
}

function expectVec3(value: unknown, path: string): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3) fail(`${path} must be [number, number, number]`)
  return [expectNumber(value[0], `${path}[0]`), expectNumber(value[1], `${path}[1]`), expectNumber(value[2], `${path}[2]`)]
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : expectString(value, path)
}

function optionalNumber(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : expectNumber(value, path)
}

function expectVec2(value: unknown, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) fail(`${path} must be [number, number]`)
  return [expectNumber(value[0], `${path}[0]`), expectNumber(value[1], `${path}[1]`)]
}

/**
 * Resolves a manifest-relative path against the package directory. Only plain
 * relative paths are accepted, so a manifest can never point outside its package
 * or at an absolute (e.g. Windows) location.
 */
export function resolvePackagePath(baseUrl: string, relativePath: string, path: string): string {
  if (
    /^[a-z][a-z\d+.-]*:/i.test(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.split('/').includes('..')
  ) {
    fail(`${path} must be a relative path inside the package (got "${relativePath}")`)
  }
  return `${baseUrl}${relativePath}`
}

function validateLod(value: unknown, path: string): ManifestLodLevel[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${path} must be a non-empty array`)
  const levels = value.map((entry, i) => {
    const level = expectRecord(entry, `${path}[${i}]`)
    const maxDistance =
      level.maxDistance === null ? null : expectNumber(level.maxDistance, `${path}[${i}].maxDistance`)
    return {
      level: expectCount(level.level, `${path}[${i}].level`),
      maxDistance,
      tris: expectCount(level.tris, `${path}[${i}].tris`),
    }
  })
  levels.sort((a, b) => a.level - b.level)
  levels.forEach((level, i) => {
    if (level.level !== i) fail(`${path} levels must be 0..${levels.length - 1} without gaps`)
    const isLast = i === levels.length - 1
    if (isLast !== (level.maxDistance === null)) {
      fail(`${path}: only the last level may (and must) have maxDistance null`)
    }
    const previous = i > 0 ? levels[i - 1].maxDistance : 0
    if (level.maxDistance !== null && !(level.maxDistance > (previous ?? 0))) {
      fail(`${path}[${i}].maxDistance must increase with level`)
    }
  })
  return levels
}

function validatePlantSet(
  key: string,
  raw: Record<string, unknown>,
  baseUrl: string,
): PlantSetDefinition {
  const path = `instanced.${key}`
  const set = raw as unknown as ManifestVariantInstancedSet
  const count = expectCount(set.count, `${path}.count`)
  const stride = expectCount(set.stride, `${path}.stride`)
  if (stride !== 16) fail(`${path}.stride must be 16 (one 4x4 matrix per instance), got ${stride}`)

  const lod = validateLod(set.lod, `${path}.lod`)
  if (!Array.isArray(set.variantNodes) || set.variantNodes.length !== lod.length) {
    fail(`${path}.variantNodes must have one entry per LOD level (${lod.length})`)
  }
  const variantNodes = set.variantNodes.map((nodes, i) => {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      fail(`${path}.variantNodes[${i}] must be a non-empty array of node names`)
    }
    return nodes.map((name, j) => expectString(name, `${path}.variantNodes[${i}][${j}]`))
  })
  // A level either has one shared node or one node per variant; per-variant levels must agree.
  const variantCounts = new Set(variantNodes.map((nodes) => nodes.length).filter((n) => n > 1))
  if (variantCounts.size > 1) fail(`${path}.variantNodes levels disagree on the number of variants`)

  const fadeMetres =
    set.fadeMetres === undefined ? null : expectNumber(set.fadeMetres, `${path}.fadeMetres`)

  return {
    key,
    count,
    stride,
    glbUrl: resolvePackagePath(baseUrl, expectString(set.glb, `${path}.glb`), `${path}.glb`),
    matricesUrl: resolvePackagePath(
      baseUrl,
      expectString(set.matrices, `${path}.matrices`),
      `${path}.matrices`,
    ),
    variantsUrl: resolvePackagePath(
      baseUrl,
      expectString(set.variants, `${path}.variants`),
      `${path}.variants`,
    ),
    variantNodes,
    lod,
    fadeMetres,
  }
}

function validateCells(value: unknown, instanceCount: number): EnvironmentCell[] {
  if (!Array.isArray(value) || value.length === 0) fail('cells must be a non-empty array')
  const cells = value.map((entry, i): EnvironmentCell => {
    const cell = expectRecord(entry, `cells[${i}]`) as unknown as ManifestCell
    const min = expectVec2(cell.min, `cells[${i}].min`)
    const max = expectVec2(cell.max, `cells[${i}].max`)
    if (!(min[0] <= max[0] && min[1] <= max[1])) fail(`cells[${i}] min must not exceed max`)
    // Ground plane is Blender (X, Y); glTF Y-up maps Blender Y to -Z.
    return {
      id: expectCount(cell.id, `cells[${i}].id`),
      start: expectCount(cell.start, `cells[${i}].start`),
      count: expectCount(cell.count, `cells[${i}].count`),
      minX: min[0],
      maxX: max[0],
      minZ: -max[1],
      maxZ: -min[1],
    }
  })

  // Cells must tile the instance range contiguously in order.
  let expectedStart = 0
  for (const cell of cells) {
    if (cell.start !== expectedStart) {
      fail(`cells[id=${cell.id}].start is ${cell.start}, expected ${expectedStart} (ranges must be contiguous)`)
    }
    expectedStart += cell.count
  }
  if (expectedStart !== instanceCount) {
    fail(`cells cover ${expectedStart} instances but the plant set has ${instanceCount}`)
  }
  return cells
}

/** Single-node instanced sets (fence parts) that draw from the given GLB. */
function validateNodeSets(
  instanced: Record<string, unknown>,
  glb: string,
  baseUrl: string,
): NodeInstancedSetDefinition[] {
  return Object.entries(instanced)
    .filter(([, set]) => isRecord(set) && set.glb === glb && 'node' in set)
    .map(([key, raw]) => {
      const set = raw as Record<string, unknown>
      const path = `instanced.${key}`
      return {
        key,
        node: expectString(set.node, `${path}.node`),
        count: expectCount(set.count, `${path}.count`),
        tris: expectCount(set.tris, `${path}.tris`),
        matricesUrl: resolvePackagePath(baseUrl, expectString(set.matrices, `${path}.matrices`), `${path}.matrices`),
      }
    })
}

function validateAssets(
  scene: Record<string, unknown>,
  root: Record<string, unknown>,
  baseUrl: string,
): Record<EnvironmentAssetKey, EnvironmentAsset | null> {
  const optimized = isRecord(root.optimized) ? root.optimized : {}
  const ktx2 = isRecord(optimized.ktx2) ? optimized.ktx2 : {}
  const asset = (key: EnvironmentAssetKey): EnvironmentAsset | null => {
    const path = optionalString(scene[key], `scene.${key}`)
    if (!path) return null
    const ktx2Path = optionalString(ktx2[key], `optimized.ktx2.${key}`)
    return {
      url: resolvePackagePath(baseUrl, path, `scene.${key}`),
      ktx2Url: ktx2Path ? resolvePackagePath(baseUrl, ktx2Path, `optimized.ktx2.${key}`) : null,
    }
  }
  return { shell: asset('shell'), plants: asset('plants'), fence: asset('fence'), props: asset('props') }
}

/**
 * Blender markers map one-to-one onto the existing CameraWaypoint / PropertyPinConfig types.
 * Coordinates are already in glTF space (markers.coordinateSpace) and are used unchanged.
 * Arrays are "pinMarkers"/"cameraMarkers" (Blender WEB_MARKERS export); the earlier
 * "pins"/"cameras" names are still read. A camera without a "name" takes its pin's label.
 */
function validateMarkers(value: unknown): EnvironmentDefinition['markers'] {
  if (value === undefined) return null
  const markers = expectRecord(value, 'markers')
  const cameraKey = Array.isArray(markers.cameraMarkers) ? 'cameraMarkers' : 'cameras'
  const pinKey = Array.isArray(markers.pinMarkers) ? 'pinMarkers' : 'pins'
  const cameraEntries = markers[cameraKey]
  const pinEntries = markers[pinKey]
  if (!Array.isArray(cameraEntries)) fail('markers.cameraMarkers must be an array')
  if (!Array.isArray(pinEntries)) fail('markers.pinMarkers must be an array')

  const pinLabels = new Map<unknown, unknown>(
    pinEntries.filter(isRecord).map((pin) => [pin.id, pin.label]),
  )
  const cameras = cameraEntries.map((entry, i): CameraWaypoint => {
    const path = `markers.${cameraKey}[${i}]`
    const cam = expectRecord(entry, path)
    const id = expectString(cam.id, `${path}.id`)
    const linkedLabel = pinLabels.get(cam.pinId)
    return {
      id,
      name: cam.name !== undefined ? expectString(cam.name, `${path}.name`) : typeof linkedLabel === 'string' ? linkedLabel : id,
      position: expectVec3(cam.position, `${path}.position`),
      target: expectVec3(cam.target, `${path}.target`),
      fov: optionalNumber(cam.fov, `${path}.fov`),
      duration: optionalNumber(cam.duration, `${path}.duration`),
    }
  })
  const pins = pinEntries.map((entry, i): PropertyPinConfig => {
    const path = `markers.${pinKey}[${i}]`
    const pin = expectRecord(entry, path)
    if (pin.enabled !== undefined && typeof pin.enabled !== 'boolean') fail(`${path}.enabled must be a boolean`)
    return {
      id: expectString(pin.id, `${path}.id`),
      label: expectString(pin.label, `${path}.label`),
      position: expectVec3(pin.position, `${path}.position`),
      waypointId: expectString(pin.waypointId, `${path}.waypointId`),
      description: optionalString(pin.description, `${path}.description`),
      enabled: pin.enabled as boolean | undefined,
    }
  })
  for (const [kind, list] of [['camera', cameras], ['pin', pins]] as const) {
    const ids = list.map((item) => item.id)
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
    if (duplicate) fail(`duplicate ${kind} marker id "${duplicate}"`)
  }
  // A pin pointing at a missing camera is dropped rather than failing the whole environment.
  const cameraIds = new Set(cameras.map((camera) => camera.id))
  const usablePins = pins.filter((pin) => {
    if (cameraIds.has(pin.waypointId)) return true
    console.warn(`[environment] layout.json: pin marker "${pin.id}" references unknown camera marker "${pin.waypointId}"; skipped.`)
    return false
  })
  return { cameras, pins: usablePins }
}

function validateSun(lighting: unknown): ManifestSun | null {
  if (!isRecord(lighting) || lighting.sun === undefined) return null
  const sun = expectRecord(lighting.sun, 'lighting.sun')
  const direction = expectVec3(sun.direction, 'lighting.sun.direction')
  if (Math.hypot(...direction) < 1e-6) fail('lighting.sun.direction must not be zero')
  return { direction, strength: optionalNumber(sun.strength, 'lighting.sun.strength') }
}

function validateShadows(value: unknown): EnvironmentShadowAdvice {
  const shadows = isRecord(value) ? value : {}
  const names = (key: string) => {
    const list = shadows[key]
    if (list === undefined) return new Set<string>()
    if (!Array.isArray(list)) fail(`shadows.${key} must be an array of node names`)
    return new Set(list.map((name, i) => expectString(name, `shadows.${key}[${i}]`)))
  }
  return {
    cast: names('cast'),
    receiveOnly: names('receiveOnly'),
    neither: names('neither'),
    castPlantsWithin: optionalNumber(shadows.castPlantsWithin, 'shadows.castPlantsWithin') ?? null,
  }
}

/** Validates parsed layout.json and resolves every path the runtime needs. */
export function parseEnvironmentManifest(json: unknown, baseUrl: string): EnvironmentDefinition {
  const root = expectRecord(json, 'root')
  const schema = expectString(root.schema, 'schema')
  if (schema !== SUPPORTED_SCHEMA) fail(`unsupported schema "${schema}" (expected "${SUPPORTED_SCHEMA}")`)
  if (root.upAxis !== 'Y') fail(`upAxis must be "Y", got ${JSON.stringify(root.upAxis)}`)
  if (root.units !== 'metres') fail(`units must be "metres", got ${JSON.stringify(root.units)}`)

  const site = expectRecord(root.site, 'site')
  const siteMin = expectVec2(site.min, 'site.min')
  const siteMax = expectVec2(site.max, 'site.max')

  const scene = expectRecord(root.scene, 'scene')
  const shellPath = expectString(scene.shell, 'scene.shell')
  const plantsGlb = expectString(scene.plants, 'scene.plants')

  // The plant set is the variant-driven instanced set that draws from scene.plants.
  const instanced = expectRecord(root.instanced, 'instanced')
  const plantEntries = Object.entries(instanced).filter(
    ([, set]) => isRecord(set) && set.glb === plantsGlb && 'variantNodes' in set,
  )
  if (plantEntries.length !== 1) {
    fail(`expected exactly one instanced set with glb "${plantsGlb}" and variantNodes, found ${plantEntries.length}`)
  }
  const [plantKey, plantRaw] = plantEntries[0]
  const plants = validatePlantSet(plantKey, plantRaw as Record<string, unknown>, baseUrl)

  return {
    baseUrl,
    manifest: root as unknown as EnvironmentManifest,
    shellUrl: resolvePackagePath(baseUrl, shellPath, 'scene.shell'),
    plants,
    cells: validateCells(root.cells, plants.count),
    assets: validateAssets(scene, root, baseUrl),
    fence: typeof scene.fence === 'string' ? validateNodeSets(instanced, scene.fence, baseUrl) : [],
    markers: validateMarkers(root.markers),
    sun: validateSun(root.lighting),
    shadows: validateShadows(root.shadows),
    // Same ground-plane convention as cells: Blender (x, y) -> glTF (x, -y).
    siteBounds: { minX: siteMin[0], maxX: siteMax[0], minZ: -siteMax[1], maxZ: -siteMin[1] },
  }
}

/** Fetches and validates layout.json from an environment package directory. */
export async function loadEnvironmentManifest(
  baseUrl: string,
  manifestFile: string,
  signal?: AbortSignal,
): Promise<EnvironmentDefinition> {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = `${normalizedBase}${manifestFile}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new EnvironmentManifestError(`Failed to fetch ${url}: HTTP ${response.status}`)
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new EnvironmentManifestError(`${url} is not valid JSON`)
  }
  return parseEnvironmentManifest(json, normalizedBase)
}
