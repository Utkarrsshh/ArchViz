import { Color, MeshStandardMaterial, Vector3, type Material } from 'three'
import { PLANT_CARD_CONFIG } from '../../config/plants'
import type { PlantLodSource, PlantPart } from './plantLOD'

/**
 * Runtime presentation of the exported card / billboard LODs. The asset itself is untouched.
 *
 * 1. Alpha: the exported card material is alpha BLEND. Blended instances are not sorted
 *    within an InstancedMesh, so cards overdraw each other incorrectly. Cards are drawn
 *    as alpha-tested cut-outs with alpha-to-coverage instead: opaque pass, depth-correct,
 *    MSAA-smoothed edges, no sorting. Alpha is boosted with the sampled mip level so
 *    distant cards keep their coverage: averaged alpha in small mips otherwise falls under
 *    the cut-off and whole fields of far plants vanish.
 *
 * 2. Optional per-project texture corrections (config/plants.ts): a colour multiplier for
 *    cards with baked-in lighting, and discarding texels above a v coordinate (e.g. a baked
 *    ground strip). Both are off by default.
 *
 * 3. Billboard (last LOD only, when planar): the quad is exported with each plant's own
 *    rotation, so most would appear edge-on. It is turned to face the camera, anchored at
 *    the instance origin (its base) and sized by the instance matrix's X/Y column lengths.
 *    Facing is spherical: identical to an upright billboard at eye level, but the card
 *    tilts back toward elevated cameras, so aerial views are not reduced to slivers.
 *    Rotation and shear are intentionally ignored on that level; other levels keep their
 *    full matrices.
 */
const CARD_ALPHA_TEST = 0.5
const CARD_ALBEDO_CORRECTION = PLANT_CARD_CONFIG.albedoCorrection
  ? new Color(...PLANT_CARD_CONFIG.albedoCorrection)
  : null
const CARD_DISCARD_ABOVE_V = PLANT_CARD_CONFIG.discardAboveV
/** Alpha gain per mip level for cut-out coverage at distance. */
const CARD_MIP_ALPHA_SCALE = 0.25
const scratchSize = new Vector3()

const CARD_DISCARD_FRAGMENT =
  CARD_DISCARD_ABOVE_V === null
    ? ''
    : /* glsl */ `
#ifdef USE_MAP
  if ( vMapUv.y > ${CARD_DISCARD_ABOVE_V.toFixed(4)} ) discard;
#endif`

const CARD_ALPHA_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec2 cardTexel = vMapUv * vec2( textureSize( map, 0 ) );
  vec2 cardDx = dFdx( cardTexel );
  vec2 cardDy = dFdy( cardTexel );
  float cardMip = max( 0.0, 0.5 * log2( max( dot( cardDx, cardDx ), dot( cardDy, cardDy ) ) ) );
  diffuseColor.a *= 1.0 + cardMip * ${CARD_MIP_ALPHA_SCALE.toFixed(2)};
#endif
#include <alphatest_fragment>${CARD_DISCARD_FRAGMENT}`

const BILLBOARD_BASIS = /* glsl */ `
#include <defaultnormal_vertex>
#ifdef USE_INSTANCING
  vec3 bbOrigin = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  vec3 bbForward = normalize( cameraPosition - bbOrigin );
  vec3 bbRight = cross( vec3( 0.0, 1.0, 0.0 ), bbForward );
  // Straight overhead the up/forward cross product vanishes; use the camera's right axis.
  bbRight = length( bbRight ) > 1e-3 ? normalize( bbRight ) : vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
  vec3 bbUp = cross( bbForward, bbRight );
  float bbWidth = length( instanceMatrix[ 0 ].xyz );
  float bbHeight = length( instanceMatrix[ 1 ].xyz );
  transformedNormal = normalize( ( viewMatrix * vec4( bbForward, 0.0 ) ).xyz );
#endif`

const BILLBOARD_PROJECT = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 bbWorld = bbOrigin + bbRight * ( transformed.x * bbWidth ) + bbUp * ( transformed.y * bbHeight );
  vec4 mvPosition = viewMatrix * vec4( bbWorld, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
#else
  #include <project_vertex>
#endif`

const BILLBOARD_WORLDPOS = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  #ifdef USE_INSTANCING
    vec4 worldPosition = vec4( bbWorld, 1.0 );
  #else
    vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
  #endif
#endif`

function createCardMaterial(source: MeshStandardMaterial, billboard: boolean): MeshStandardMaterial {
  const material = source.clone()
  material.name = `${source.name}${billboard ? '_billboard' : '_cutout'}`
  material.transparent = false
  material.depthWrite = true
  material.alphaTest = CARD_ALPHA_TEST
  material.alphaToCoverage = true
  if (CARD_ALBEDO_CORRECTION) material.color.multiply(CARD_ALBEDO_CORRECTION)
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', CARD_ALPHA_FRAGMENT)
    if (billboard) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <defaultnormal_vertex>', BILLBOARD_BASIS)
        .replace('#include <project_vertex>', BILLBOARD_PROJECT)
        .replace('#include <worldpos_vertex>', BILLBOARD_WORLDPOS)
    }
  }
  material.customProgramCacheKey = () => (billboard ? 'webarchviz-plant-billboard' : 'webarchviz-plant-cutout')
  return material
}

const cache = new WeakMap<Material, { cutout?: MeshStandardMaterial; billboard?: MeshStandardMaterial }>()

function cardMaterial(source: MeshStandardMaterial, billboard: boolean): MeshStandardMaterial {
  const entry = cache.get(source) ?? {}
  cache.set(source, entry)
  const key = billboard ? 'billboard' : 'cutout'
  return (entry[key] ??= createCardMaterial(source, billboard))
}

/** A card part is an alpha-blended textured material (the exporter's WEB_PlantCard). */
function isCard(material: Material | Material[]): material is MeshStandardMaterial {
  return material instanceof MeshStandardMaterial && material.transparent && material.map !== null
}

function isPlanar(part: PlantPart): boolean {
  if (!part.geometry.boundingBox) part.geometry.computeBoundingBox()
  const size = part.geometry.boundingBox!.getSize(scratchSize)
  return Math.min(size.x, size.y, size.z) < 1e-4
}

/**
 * Returns LOD sources with card materials replaced by runtime card materials. Cards on the
 * last (unbounded) level whose geometry is a single plane become camera-facing billboards.
 * Non-card parts (full-geometry levels) are returned unchanged.
 */
export function preparePlantCardSources(sources: readonly PlantLodSource[]): PlantLodSource[] {
  const lastLevel = sources.length - 1
  return sources.map((source) => ({
    level: source.level,
    variants: source.variants.map((parts) =>
      parts.map((part) =>
        isCard(part.material)
          ? { ...part, material: cardMaterial(part.material, source.level === lastLevel && isPlanar(part)) }
          : part,
      ),
    ),
  }))
}
