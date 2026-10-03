import {
  Box3,
  DynamicDrawUsage,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Vector3,
  type Camera,
} from 'three'
import type { EnvironmentCell, PlantInstanceData, PlantRenderStats } from './environmentTypes'
import {
  createLodBands,
  lodLevelForDistanceSq,
  variantSlot,
  type PlantLodBands,
  type PlantLodSource,
} from './plantLOD'

const FLOATS_PER_MATRIX = 16
/** A cell straddling a LOD boundary is re-classified per instance once the camera moves this far. */
const RECLASSIFY_DISTANCE = 0.25
const RECLASSIFY_DISTANCE_SQ = RECLASSIFY_DISTANCE * RECLASSIFY_DISTANCE

/** Cell LOD modes: a level index when the whole cell shares one level, or one of these. */
const MODE_UNSET = -1
const MODE_MIXED = -2

/**
 * The instances of one cell that use one variant node at one LOD level. All parts
 * (glTF primitives) of the node share a single instance-matrix attribute.
 */
interface PlantBatch {
  /** Global instance indices, in original export order. */
  readonly indices: Uint32Array
  readonly attribute: InstancedBufferAttribute
  readonly meshes: readonly InstancedMesh[]
  count: number
}

interface PlantCell {
  readonly id: number
  readonly start: number
  readonly count: number
  /** World-space bounds of every plant in the cell (exported ground rect ∪ transformed geometry). */
  readonly box: Box3
  readonly group: Group
  /** batches[level][variantSlot] */
  readonly batches: readonly (readonly PlantBatch[])[]
  /** Scratch per-instance LOD levels for mixed classification. */
  readonly levels: Uint8Array
  readonly lastClassifiedFrom: Vector3
  mode: number
  visible: boolean
}

export function createPlantRenderStats(): PlantRenderStats {
  return {
    totalInstances: 0,
    totalCells: 0,
    visibleCells: 0,
    mixedCells: 0,
    instancesPerLod: [],
    drawCalls: 0,
    instancedMeshes: 0,
  }
}

function copyMatrix(src: Float32Array, srcIndex: number, dst: Float32Array, dstIndex: number): void {
  const s = srcIndex * FLOATS_PER_MATRIX
  const d = dstIndex * FLOATS_PER_MATRIX
  for (let k = 0; k < FLOATS_PER_MATRIX; k++) dst[d + k] = src[s + k]
}

/**
 * Spatial cell manager for instanced plants.
 *
 * Structure: one Group per exported cell, holding one batch per (LOD level × variant
 * node), each batch holding one InstancedMesh per glTF primitive. Instance matrices are
 * copied verbatim from the exported binary — never decomposed.
 *
 * Per frame: each cell box is tested against the camera frustum; hidden cells are
 * switched off. For a visible cell, the nearest and farthest box distances are mapped
 * to LOD levels. If both fall in the same level the whole cell uses it (no per-plant
 * work). Only cells that straddle a LOD boundary classify their own instances, and
 * only after the camera has moved RECLASSIFY_DISTANCE since the last classification.
 */
export class PlantCellManager {
  readonly root = new Group()
  private readonly cells: PlantCell[]
  private readonly bands: PlantLodBands
  private readonly matrices: Float32Array

  private readonly frustum = new Frustum()
  private readonly viewProjection = new Matrix4()
  private readonly cameraPosition = new Vector3()
  private readonly stats: PlantRenderStats

  constructor(
    cells: readonly EnvironmentCell[],
    data: PlantInstanceData,
    sources: readonly PlantLodSource[],
    lodBands: Parameters<typeof createLodBands>[0],
    stats: PlantRenderStats,
  ) {
    this.stats = stats
    this.root.name = 'EnvironmentPlants'
    this.root.matrixAutoUpdate = false
    this.matrices = data.matrices
    this.bands = createLodBands(lodBands)

    const localBounds = this.computeSourceBounds(sources)
    this.cells = cells.map((cell) => this.createCell(cell, data, sources, localBounds))

    stats.totalInstances = data.count
    stats.totalCells = this.cells.length
    stats.instancesPerLod = new Array<number>(this.bands.levelCount).fill(0)
    stats.instancedMeshes = this.cells.reduce(
      (sum, cell) => sum + cell.batches.flat().reduce((n, batch) => n + batch.meshes.length, 0),
      0,
    )
  }

  /** Union of every LOD geometry's local bounds: an envelope for any instance. */
  private computeSourceBounds(sources: readonly PlantLodSource[]): Box3 {
    const bounds = new Box3()
    for (const source of sources) {
      for (const parts of source.variants) {
        for (const { geometry } of parts) {
          if (!geometry.boundingBox) geometry.computeBoundingBox()
          bounds.union(geometry.boundingBox!)
        }
      }
    }
    return bounds
  }

  private createCell(
    cell: EnvironmentCell,
    data: PlantInstanceData,
    sources: readonly PlantLodSource[],
    localBounds: Box3,
  ): PlantCell {
    const group = new Group()
    group.name = `PlantCell_${cell.id}`
    group.matrixAutoUpdate = false
    group.visible = false
    this.root.add(group)

    // Bounds: transform the local envelope by each instance matrix once at build time
    // (Box3.applyMatrix4 transforms the 8 corners, so shear is respected), then include
    // the exported ground rectangle.
    const box = new Box3()
    const scratchBox = new Box3()
    const scratchMatrix = new Matrix4()
    for (let i = cell.start; i < cell.start + cell.count; i++) {
      scratchMatrix.fromArray(data.matrices, i * FLOATS_PER_MATRIX)
      box.union(scratchBox.copy(localBounds).applyMatrix4(scratchMatrix))
    }
    if (box.isEmpty()) box.set(new Vector3(cell.minX, 0, cell.minZ), new Vector3(cell.maxX, 0, cell.maxZ))
    box.expandByPoint(new Vector3(cell.minX, box.min.y, cell.minZ))
    box.expandByPoint(new Vector3(cell.maxX, box.max.y, cell.maxZ))

    const batches = sources.map((source) =>
      source.variants.map((parts, slot) => {
        const indices: number[] = []
        for (let i = cell.start; i < cell.start + cell.count; i++) {
          if (variantSlot(source, data.variants[i]) === slot) indices.push(i)
        }
        const attribute = new InstancedBufferAttribute(
          new Float32Array(Math.max(indices.length, 1) * FLOATS_PER_MATRIX),
          FLOATS_PER_MATRIX,
        )
        attribute.setUsage(DynamicDrawUsage)

        const meshes = parts.map((part, partIndex) => {
          const mesh = new InstancedMesh(part.geometry, part.material, 0)
          mesh.instanceMatrix = attribute
          mesh.count = 0
          mesh.visible = false
          mesh.frustumCulled = false // culled per cell by this manager
          mesh.matrixAutoUpdate = false
          mesh.name = `PlantCell_${cell.id}_L${source.level}_v${slot}_p${partIndex}`
          group.add(mesh)
          return mesh
        })

        return { indices: Uint32Array.from(indices), attribute, meshes, count: 0 }
      }),
    )

    return {
      id: cell.id,
      start: cell.start,
      count: cell.count,
      box,
      group,
      batches,
      levels: new Uint8Array(cell.count),
      lastClassifiedFrom: new Vector3(),
      mode: MODE_UNSET,
      visible: false,
    }
  }

  private setBatchCount(batch: PlantBatch, count: number): void {
    batch.count = count
    for (const mesh of batch.meshes) {
      mesh.count = count
      mesh.visible = count > 0
    }
    if (count > 0) {
      batch.attribute.clearUpdateRanges()
      batch.attribute.addUpdateRange(0, count * FLOATS_PER_MATRIX)
      batch.attribute.needsUpdate = true
    }
  }

  /** Whole cell at one LOD level: every instance goes to that level's batches. */
  private assignUniform(cell: PlantCell, level: number): void {
    const { matrices } = this
    cell.batches.forEach((levelBatches, l) => {
      for (const batch of levelBatches) {
        if (l !== level) {
          if (batch.count !== 0) this.setBatchCount(batch, 0)
          continue
        }
        const { indices } = batch
        const dst = batch.attribute.array as Float32Array
        for (let n = 0; n < indices.length; n++) copyMatrix(matrices, indices[n], dst, n)
        this.setBatchCount(batch, indices.length)
      }
    })
  }

  /** Cell straddles a LOD boundary: classify its instances by distance to their origin. */
  private assignPerInstance(cell: PlantCell, camera: Vector3): void {
    const { matrices, bands } = this
    const { levels, start } = cell
    for (let i = 0; i < cell.count; i++) {
      const t = (start + i) * FLOATS_PER_MATRIX + 12 // translation column
      const dx = matrices[t] - camera.x
      const dy = matrices[t + 1] - camera.y
      const dz = matrices[t + 2] - camera.z
      levels[i] = lodLevelForDistanceSq(bands, dx * dx + dy * dy + dz * dz)
    }
    cell.batches.forEach((levelBatches, l) => {
      for (const batch of levelBatches) {
        const { indices } = batch
        const dst = batch.attribute.array as Float32Array
        let n = 0
        for (let k = 0; k < indices.length; k++) {
          const index = indices[k]
          if (levels[index - start] === l) copyMatrix(matrices, index, dst, n++)
        }
        if (n !== 0 || batch.count !== 0) this.setBatchCount(batch, n)
      }
    })
  }

  /** Squared distance from p to the farthest point of the box. */
  private static farthestDistanceSq(box: Box3, p: Vector3): number {
    const dx = Math.max(Math.abs(p.x - box.min.x), Math.abs(p.x - box.max.x))
    const dy = Math.max(Math.abs(p.y - box.min.y), Math.abs(p.y - box.max.y))
    const dz = Math.max(Math.abs(p.z - box.min.z), Math.abs(p.z - box.max.z))
    return dx * dx + dy * dy + dz * dz
  }

  /** Per-frame culling and LOD selection against the active camera. Allocation-free. */
  update(camera: Camera): void {
    camera.updateMatrixWorld()
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProjection)
    const position = this.cameraPosition.setFromMatrixPosition(camera.matrixWorld)

    const { stats, bands } = this
    const perLod = stats.instancesPerLod
    perLod.fill(0)
    let visibleCells = 0
    let mixedCells = 0
    let drawCalls = 0

    for (const cell of this.cells) {
      const visible = cell.count > 0 && this.frustum.intersectsBox(cell.box)
      if (visible !== cell.visible) {
        cell.visible = visible
        cell.group.visible = visible
      }
      if (!visible) continue
      visibleCells++

      const near = cell.box.distanceToPoint(position)
      const nearLevel = lodLevelForDistanceSq(bands, near * near)
      const farLevel = lodLevelForDistanceSq(bands, PlantCellManager.farthestDistanceSq(cell.box, position))

      if (nearLevel === farLevel) {
        if (cell.mode !== nearLevel) {
          this.assignUniform(cell, nearLevel)
          cell.mode = nearLevel
        }
      } else {
        mixedCells++
        if (cell.mode !== MODE_MIXED || cell.lastClassifiedFrom.distanceToSquared(position) > RECLASSIFY_DISTANCE_SQ) {
          this.assignPerInstance(cell, position)
          cell.lastClassifiedFrom.copy(position)
          cell.mode = MODE_MIXED
        }
      }

      for (let l = 0; l < cell.batches.length; l++) {
        for (const batch of cell.batches[l]) {
          if (batch.count === 0) continue
          perLod[l] += batch.count
          drawCalls += batch.meshes.length
        }
      }
    }

    stats.visibleCells = visibleCells
    stats.mixedCells = mixedCells
    stats.drawCalls = drawCalls
  }

  /**
   * Shadow flags per LOD level. Casting is opt-in per level because a level's shadow cost
   * scales with its triangle count times the instances currently assigned to it.
   */
  setShadows(castLevels: ReadonlySet<number>, receive: boolean): void {
    for (const cell of this.cells) {
      cell.batches.forEach((levelBatches, level) => {
        for (const batch of levelBatches) {
          for (const mesh of batch.meshes) {
            mesh.castShadow = castLevels.has(level)
            mesh.receiveShadow = receive
          }
        }
      })
    }
  }

  /** Releases GPU resources owned by this manager. Geometry and materials belong to the GLTF cache. */
  dispose(): void {
    for (const cell of this.cells) {
      for (const batch of cell.batches.flat()) {
        for (const mesh of batch.meshes) mesh.dispose()
      }
      cell.mode = MODE_UNSET
    }
  }
}
