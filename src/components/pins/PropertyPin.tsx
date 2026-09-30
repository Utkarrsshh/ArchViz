import { memo, useId, type RefObject } from 'react'
import { Html } from '@react-three/drei'
import { useCameraSystem } from '../../systems/camera/cameraContext'
import type { PropertyPinConfig } from '../../systems/pins/pinTypes'
import './PropertyPin.css'

/** Keeps pin labels below future overlay UI; drei orders pins by depth within this range. */
const PIN_Z_INDEX_RANGE = [20, 1]

interface PropertyPinProps {
  pin: PropertyPinConfig
  active: boolean
  /** Stable DOM element the label is mounted into. */
  labelContainer: RefObject<HTMLElement> | undefined
  /** Marks this pin active; returns a token identifying the selection. */
  onSelect: (pinId: string) => number
  /** Clears the selection if it is still the one identified by the token. */
  onRelease: (token: number) => void
}

/**
 * One pin: a screen-space HTML button anchored to a world position. A native
 * <button> gives keyboard focus, Enter/Space activation and an accessible name
 * with a single click handler, so pointer and keyboard never double-fire.
 */
function PropertyPin({ pin, active, labelContainer, onSelect, onRelease }: PropertyPinProps) {
  const { moveToWaypoint } = useCameraSystem()
  const descriptionId = useId()

  // Html renders into a separate React root, so hooks stay here and only the handler is passed in.
  const handleClick = () => {
    const token = onSelect(pin.id)
    void moveToWaypoint(pin.waypointId).then((completed) => {
      if (!completed) onRelease(token)
    })
  }

  return (
    <Html
      position={pin.position}
      portal={labelContainer}
      zIndexRange={PIN_Z_INDEX_RANGE}
      pointerEvents="none"
    >
      <button
        type="button"
        className="property-pin"
        data-active={active}
        aria-pressed={active}
        aria-describedby={pin.description ? descriptionId : undefined}
        onClick={handleClick}
      >
        <span className="property-pin__marker" aria-hidden="true" />
        <span className="property-pin__label">{pin.label}</span>
        {pin.description && (
          <span id={descriptionId} className="property-pin__description">
            {pin.description}
          </span>
        )}
      </button>
    </Html>
  )
}

export default memo(PropertyPin)
