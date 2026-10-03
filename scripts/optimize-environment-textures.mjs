#!/usr/bin/env node
/**
 * Derives KTX2 (Basis Universal) copies of an environment package's GLBs.
 *
 *   npm run optimize:textures -- [packageDir]        (default: public/environments/polyhouse)
 *
 * Inputs are never modified. For each scene/<name>.glb this writes
 * scene/optimized/<name>.ktx.glb, then records the outputs in layout.json under
 * "optimized.ktx2" so the runtime can find them (and fall back when absent).
 *
 * Encoding per texture role (decided from each material's slot usage):
 *   UASTC  normalTexture                      - ETC1S block artefacts break normals
 *   UASTC  alpha-carrying baseColor textures  - cut-out/blend edges (fence wire, plant card, net)
 *   ETC1S  everything else                    - opaque baseColor, metallicRoughness
 *
 * Requires KTX-Software 4.3+ (`ktx` on PATH, or set KTX_SOFTWARE_BIN).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const packageDir = path.resolve(process.argv[2] ?? 'public/environments/polyhouse')
const layoutPath = path.join(packageDir, 'layout.json')
const outDir = path.join(packageDir, 'scene', 'optimized')

// Texture-name globs of baseColor textures that carry meaningful alpha (verified in the GLBs:
// RGBA PNGs used by BLEND materials). Matched by gltf-transform against texture name/URI.
const ALPHA_BASECOLOR_PATTERN = '{*alpha*,plant_card}'

const ktxBin = process.env.KTX_SOFTWARE_BIN ??
  (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'KTX-Software', 'bin'))
const env = { ...process.env }
if (ktxBin && existsSync(ktxBin)) env.PATH = `${ktxBin}${path.delimiter}${env.PATH}`

const gltfTransformCli = path.resolve('node_modules/@gltf-transform/cli/bin/cli.js')

function run(args) {
  execFileSync(process.execPath, [gltfTransformCli, ...args], { stdio: ['ignore', 'inherit', 'inherit'], env })
}

function mb(file) {
  return (statSync(file).size / 1e6).toFixed(2)
}

try {
  execFileSync('ktx', ['--version'], { env, stdio: 'pipe' })
} catch {
  console.error('KTX-Software not found. Install it (https://github.com/KhronosGroup/KTX-Software/releases) or set KTX_SOFTWARE_BIN.')
  process.exit(1)
}

const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
mkdirSync(outDir, { recursive: true })

const outputs = {}
for (const [key, relative] of Object.entries(layout.scene)) {
  const input = path.join(packageDir, relative)
  const name = path.basename(relative, '.glb')
  const output = path.join(outDir, `${name}.ktx.glb`)
  const stepA = path.join(outDir, `${name}.tmp-a.glb`)
  const stepB = path.join(outDir, `${name}.tmp-b.glb`)
  console.log(`\n== ${relative}`)

  run(['uastc', input, stepA, '--slots', 'normalTexture', '--level', '2', '--rdo', '--rdo-lambda', '0.5', '--zstd', '18'])
  run(['uastc', stepA, stepB, '--slots', 'baseColorTexture', '--pattern', ALPHA_BASECOLOR_PATTERN, '--level', '2', '--rdo', '--zstd', '18'])
  // ETC1S takes the remaining PNG textures; textures already in KTX2 are left untouched.
  run(['etc1s', stepB, output, '--quality', '192', '--compression', '2'])

  rmSync(stepA)
  rmSync(stepB)
  outputs[key] = path.posix.join('scene', 'optimized', `${name}.ktx.glb`)
  console.log(`   ${mb(input)} MB -> ${mb(output)} MB`)
}

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
