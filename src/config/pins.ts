import type { PropertyPinConfig } from '../systems/pins/pinTypes'

/**
 * Fallback pins, used only when the environment package has no Blender markers
 * (layout.json "markers") or fails to load. Project pins come from Blender PIN_* markers;
 * leave this empty unless a project deliberately ships pins without markers.
 */
export const PROPERTY_PINS: readonly PropertyPinConfig[] = []
