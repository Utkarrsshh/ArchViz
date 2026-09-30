import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { PropertyPinConfig } from '../../systems/pins/pinTypes'
import PropertyPin from './PropertyPin'

interface PropertyPinLayerProps {
  pins: readonly PropertyPinConfig[]
}

function validatePins(pins: readonly PropertyPinConfig[]): void {
  const seen = new Set<string>()
  for (const pin of pins) {
    if (seen.has(pin.id)) console.warn(`[pins] Duplicate pin id "${pin.id}".`)
    seen.add(pin.id)
    if (!pin.waypointId) console.warn(`[pins] Pin "${pin.id}" has no waypointId.`)
    if (pin.position.length !== 3 || !pin.position.every(Number.isFinite)) {
      console.warn(`[pins] Pin "${pin.id}" position must be three finite numbers.`)
    }
  }
}

/**
 * Renders every enabled pin and owns which one is active. Selection uses a
 * token so an interrupted move can only clear the selection it started.
 */
export default function PropertyPinLayer({ pins }: PropertyPinLayerProps) {
  const [activePinId, setActivePinId] = useState<string | null>(null)
  const selectionTokenRef = useRef(0)
  const canvasElement = useThree((state) => state.gl.domElement)

  // drei's Html re-creates its DOM root without re-rendering it when its default mount
  // target changes (which happens once R3F connects events), leaving a pin empty.
  // A fixed container avoids that.
  const labelContainer = useMemo<RefObject<HTMLElement> | undefined>(() => {
    const parent = canvasElement.parentElement
    return parent ? { current: parent } : undefined
  }, [canvasElement])

  useEffect(() => {
    if (import.meta.env.DEV) validatePins(pins)
  }, [pins])

  const select = useCallback((pinId: string) => {
    setActivePinId(pinId)
    return ++selectionTokenRef.current
  }, [])

  const release = useCallback((token: number) => {
    if (token === selectionTokenRef.current) setActivePinId(null)
  }, [])

  return (
    <>
      {pins
        .filter((pin) => pin.enabled !== false)
        .map((pin) => (
          <PropertyPin
            key={pin.id}
            pin={pin}
            active={pin.id === activePinId}
            labelContainer={labelContainer}
            onSelect={select}
            onRelease={release}
          />
        ))}
    </>
  )
}
