import type { PlantInstanceData, PlantSetDefinition } from './environmentTypes'

const FLOATS_PER_MATRIX = 16
const IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

async function fetchBinary(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  return response.arrayBuffer()
}

/** The exporter writes little-endian float32; copy through a DataView only on big-endian hosts. */
function decodeFloat32LE(buffer: ArrayBuffer): Float32Array {
  if (IS_LITTLE_ENDIAN) return new Float32Array(buffer)
  const view = new DataView(buffer)
  const out = new Float32Array(buffer.byteLength / 4)
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true)
  return out
}

/**
 * Column-major affine matrices have [0, 0, 0, 1] in elements 3, 7, 11, 15.
 * Checking this catches a row-major or mis-strided file before it renders as garbage.
 */
function validateAffineMatrices(matrices: Float32Array, count: number, label: string): void {
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_MATRIX
    for (let k = 0; k < FLOATS_PER_MATRIX; k++) {
      if (!Number.isFinite(matrices[o + k])) throw new Error(`${label} matrix ${i} contains a non-finite value`)
    }
    if (matrices[o + 3] !== 0 || matrices[o + 7] !== 0 || matrices[o + 11] !== 0 || matrices[o + 15] !== 1) {
      throw new Error(`${label} matrix ${i} is not a column-major affine matrix (bottom row is not [0, 0, 0, 1])`)
    }
  }
}

/**
 * Loads a matrices file of `count` column-major 4x4 float32 matrices (same format as
 * plant_matrices.bin; used by the fence sets). Returned unchanged for InstancedMesh.
 */
export async function loadInstanceMatrices(url: string, count: number, signal?: AbortSignal): Promise<Float32Array> {
  const buffer = await fetchBinary(url, signal)
  const expectedBytes = count * FLOATS_PER_MATRIX * 4
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`${url}: expected ${expectedBytes} bytes (${count} x 16 float32), got ${buffer.byteLength}`)
  }
  const matrices = decodeFloat32LE(buffer)
  validateAffineMatrices(matrices, count, url)
  return matrices
}

/**
 * Loads plant_matrices.bin and plant_variants.bin.
 *
 * Format (layout.json "matrixOrder"): one column-major 4x4 float32 matrix per
 * instance in glTF Y-up space, passed to InstancedMesh unchanged. The matrices
 * are never decomposed: part of the crop carries non-uniform scale under
 * rotation (shear), which position/quaternion/scale cannot represent.
 */
export async function loadPlantInstances(
  plants: PlantSetDefinition,
  signal?: AbortSignal,
): Promise<PlantInstanceData> {
  const [matrixBuffer, variantBuffer] = await Promise.all([
    fetchBinary(plants.matricesUrl, signal),
    fetchBinary(plants.variantsUrl, signal),
  ])

  const expectedMatrixBytes = plants.count * plants.stride * 4
  if (matrixBuffer.byteLength !== expectedMatrixBytes) {
    throw new Error(
      `${plants.matricesUrl}: expected ${expectedMatrixBytes} bytes (${plants.count} x ${plants.stride} float32), got ${matrixBuffer.byteLength}`,
    )
  }
  if (variantBuffer.byteLength !== plants.count) {
    throw new Error(
      `${plants.variantsUrl}: expected ${plants.count} bytes (one uint8 per instance), got ${variantBuffer.byteLength}`,
    )
  }

  const matrices = decodeFloat32LE(matrixBuffer)
  const variants = new Uint8Array(variantBuffer)

  validateAffineMatrices(matrices, plants.count, 'Plant')

  // Every variant must address a node on each LOD level that has more than one node.
  const maxVariants = Math.max(...plants.variantNodes.map((nodes) => nodes.length))
  for (let i = 0; i < plants.count; i++) {
    if (variants[i] >= maxVariants) {
      throw new Error(`Plant ${i} has variant ${variants[i]}, but only ${maxVariants} variant nodes exist`)
    }
  }

  return { count: plants.count, matrices, variants }
}
