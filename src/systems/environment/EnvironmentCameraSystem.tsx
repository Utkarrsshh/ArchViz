import { useMemo, type ReactNode } from 'react'
import { CAMERA_SETTINGS, HOME_CAMERA_ID } from '../../config/camera'
import CameraSystemProvider from '../camera/CameraSystemProvider'
import { fitCameraSettings } from './environmentCamera'
import { useEnvironmentSystem } from './environmentContext'

/**
 * Adapter between the environment and the unchanged camera system: Blender CAM_* markers
 * (already CameraWaypoint-shaped) become CameraSystemProvider's waypoints, so pins and any
 * UI keep using moveToWaypoint(id), and the scene-dependent camera settings are fitted to
 * the loaded package. Falls back to the config without a package or markers.
 */
export default function EnvironmentCameraSystem({ children }: { children: ReactNode }) {
  const { definition, markers } = useEnvironmentSystem()
  const settings = useMemo(
    () => (definition ? fitCameraSettings(CAMERA_SETTINGS, definition, markers.waypoints, HOME_CAMERA_ID) : CAMERA_SETTINGS),
    [definition, markers.waypoints],
  )
  return (
    <CameraSystemProvider settings={settings} waypoints={markers.waypoints}>
      {children}
    </CameraSystemProvider>
  )
}
