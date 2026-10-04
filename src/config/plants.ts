/**
 * Per-project corrections for the exported plant card (L2) / billboard (L3) texture, applied
 * at runtime by systems/environment/plantCardMaterials.ts. Both default to "off": prefer
 * fixing the card bake in Blender, and only use these to compensate for a bake you cannot redo.
 */
export interface PlantCardConfig {
  /**
   * Linear RGB multiplier on the card material colour, e.g. when the card texture has
   * lighting baked in and reads paler than the full-geometry LODs. null leaves it unchanged.
   */
  readonly albedoCorrection: readonly [number, number, number] | null
  /** Texels with v above this are discarded (e.g. a ground strip baked into the card). null keeps all. */
  readonly discardAboveV: number | null
}

export const PLANT_CARD_CONFIG: PlantCardConfig = {
  albedoCorrection: null,
  discardAboveV: null,
}
