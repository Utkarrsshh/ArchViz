#!/usr/bin/env node
/**
 * Derives KTX2 (Basis Universal) copies of an environment package's GLBs.
 *
 *   npm run optimize:textures -- <packageDir> [--dry-run]
 *   e.g. npm run optimize:textures -- public/environments/my-project
 *
 * Inputs are never modified. For each scene/<name>.glb this writes
 * scene/optimized/<name>.ktx.glb, then records the outputs in layout.json under
 * "optimized.ktx2" so the runtime can find them (and fall back when absent).
 * Re-run it after every Blender export: the export rewrites layout.json without "optimized".
 *
 * Encoding per texture role (decided from each GLB's materials):
 *   UASTC  normalTexture                      - ETC1S block artefacts break normals
 *   UASTC  baseColor of MASK/BLEND materials  - cut-out/blend edges (wire, foliage cards, nets)
 *   ETC1S  everything else                    - opaque baseColor, metallicRoughness
 *
 * --dry-run prints the plan (alpha textures, outputs) without encoding or writing anything.
 *
 * Requires KTX-Software 4.3+ (`ktx` on PATH, or set KTX_SOFTWARE_BIN).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const packageArg = args.find((arg) => !arg.startsWith('--'))
if (!packageArg) {
  console.error('Usage: npm run optimize:textures -- <packageDir> [--dry-run]   (e.g. public/environments/my-project)')
  process.exit(1)
}

const packageDir = path.resolve(packageArg)
const layoutPath = path.join(packageDir, 'layout.json')
const outDir = path.join(packageDir, 'scene', 'optimized')
if (!existsSync(layoutPath)) {
  console.error(`No layout.json in ${packageDir}`)
  process.exit(1)
}

const ktxBin = process.env.KTX_SOFTWARE_BIN ??
  (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'KTX-Software', 'bin'))
const env = { ...process.env }
if (ktxBin && existsSync(ktxBin)) env.PATH = `${ktxBin}${path.delimiter}${env.PATH}`

const gltfTransformCli = path.resolve('node_modules/@gltf-transform/cli/bin/cli.js')

function run(cliArgs) {
  execFileSync(process.execPath, [gltfTransformCli, ...cliArgs], { stdio: ['ignore', 'inherit', 'inherit'], env })
}

function mb(file) {
  return (statSync(file).size / 1e6).toFixed(2)
}

/** Reads the JSON chunk of a binary glTF. */
function readGlbJson(file) {
  const buffer = readFileSync(file)
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`)
  const length = buffer.readUInt32LE(12)
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'))
}

/**
 * Names of baseColor textures used by MASK/BLEND materials. gltf-transform's --pattern
 * matches these against texture names, which the Blender exporter takes from the images.
 */
function alphaBaseColorTextures(json) {
  const names = new Set()
  for (const material of json.materials ?? []) {
    if (!material.alphaMode || material.alphaMode === 'OPAQUE') continue
    const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index
    if (textureIndex === undefined) continue
    const image = json.images?.[json.textures?.[textureIndex]?.source]
    const name = image?.name ?? image?.uri
    if (name) names.add(name)
  }
  return [...names]
}

function globFor(names) {
  return names.length === 1 ? names[0] : `{${names.join(',')}}`
}

if (!dryRun) {
  try {
    execFileSync('ktx', ['--version'], { env, stdio: 'pipe' })
  } catch {
    console.error('KTX-Software not found. Install it (https://github.com/KhronosGroup/KTX-Software/releases) or set KTX_SOFTWARE_BIN.')
    process.exit(1)
  }
}

const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
if (!dryRun) mkdirSync(outDir, { recursive: true })

const outputs = {}
for (const [key, relative] of Object.entries(layout.scene)) {
  const input = path.join(packageDir, relative)
  const name = path.basename(relative, '.glb')
  const output = path.join(outDir, `${name}.ktx.glb`)
  const stepA = path.join(outDir, `${name}.tmp-a.glb`)
  const stepB = path.join(outDir, `${name}.tmp-b.glb`)
  const alphaTextures = alphaBaseColorTextures(readGlbJson(input))
  console.log(`\n== ${relative}`)
  console.log(`   alpha baseColor (UASTC): ${alphaTextures.join(', ') || 'none'}`)
  outputs[key] = path.posix.join('scene', 'optimized', `${name}.ktx.glb`)
  if (dryRun) {
    console.log(`   -> ${outputs[key]} (dry run)`)
    continue
  }

  run(['uastc', input, stepA, '--slots', 'normalTexture', '--level', '2', '--rdo', '--rdo-lambda', '0.5', '--zstd', '18'])
  if (alphaTextures.length > 0) {
    run(['uastc', stepA, stepB, '--slots', 'baseColorTexture', '--pattern', globFor(alphaTextures), '--level', '2', '--rdo', '--zstd', '18'])
  } else {
    renameSync(stepA, stepB)
  }
  // ETC1S takes the remaining PNG textures; textures already in KTX2 are left untouched.
  run(['etc1s', stepB, output, '--quality', '192', '--compression', '2'])

  rmSync(stepA, { force: true })
  rmSync(stepB, { force: true })
  console.log(`   ${mb(input)} MB -> ${mb(output)} MB`)
}

if (dryRun) process.exit(0)

layout.optimized = {
  ...(layout.optimized ?? {}),
  ktx2: {
    ...outputs,
    note: 'Derived by scripts/optimize-environment-textures.mjs (gltf-transform + KTX-Software). UASTC: normal maps and alpha baseColor; ETC1S: other colour and metallicRoughness. The PNG GLBs in scene/ remain the fallback.',
  },
}
const tmpLayout = `${layoutPath}.tmp`
writeFileSync(tmpLayout, `${JSON.stringify(layout, null, 1)}\n`)
renameSync(tmpLayout, layoutPath)
console.log(`\nUpdated ${path.relative(process.cwd(), layoutPath)} (optimized.ktx2).`)
