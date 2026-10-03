import type { PropertyPinConfig } from '../systems/pins/pinTypes'

/** Development pins, used only when the environment package has no Blender markers. */
export const PROPERTY_PINS: readonly PropertyPinConfig[] = [
  {
    id: 'pin-overview',
    label: 'Overview',
    position: [7, 0.4, 6],
    waypointId: 'overview',
    description: 'View the whole site.',
  },
  {
    id: 'pin-front',
    label: 'Front',
    position: [0, 5, 3.6],
    waypointId: 'front',
    description: 'Front elevation and glazed frontage.',
  },
  {
    id: 'pin-upper',
    label: 'Upper',
    position: [-1.5, 9.6, -0.5],
    waypointId: 'upper',
    description: 'Upper level and roof terrace.',
  },
]
