import type { Vec3Tuple } from '../systems/camera/cameraTypes'

/**
 * Scene-wide look: background, sky/ground fill and the shadow-casting sun. The sun's
 * direction comes from the package (layout.json lighting.sun, the Blender sun) when present;
 * its shadow camera is fitted to layout.json "site" (systems/environment/environmentLighting.ts).
 */
export interface LightingConfig {
  readonly backgroundColor: string
  readonly hemisphere: { readonly skyColor: string; readonly groundColor: string; readonly intensity: number }
  /** three.js intensity. Blender sun strength is not in the same units, so it is not used. */
  readonly sunIntensity: number
  /** Used until (or unless) the package provides a sun direction. Direction the light travels. */
  readonly fallbackSunDirection: Vec3Tuple
  readonly shadowMapSize: number
  readonly shadowBias: number
  readonly shadowNormalBias: number
  /** Height in metres above the ground that the sun's shadow camera must cover (tallest caster). */
  readonly shadowVolumeHeight: number
}

export const LIGHTING_CONFIG: LightingConfig = {
  backgroundColor: '#dfe6ec',
  hemisphere: { skyColor: '#ffffff', groundColor: '#8d8a82', intensity: 0.9 },
  sunIntensity: 2.2,
  fallbackSunDirection: [-18, -28, -12],
  shadowMapSize: 4096,
  shadowBias: -0.0003,
  shadowNormalBias: 0.04,
  shadowVolumeHeight: 20,
}
