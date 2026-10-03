import type { ReactNode } from 'react'
import CameraSystemProvider from '../camera/CameraSystemProvider'
import { useEnvironmentSystem } from './environmentContext'

/**
 * Adapter between the environment and the unchanged camera system: Blender CAM_* markers
 * (already CameraWaypoint-shaped) become CameraSystemProvider's waypoints, so pins and any
 * UI keep using moveToWaypoint(id). Falls back to the development config without markers.
 */
export default function EnvironmentCameraSystem({ children }: { children: ReactNode }) {
  const { markers } = useEnvironmentSystem()
  return <CameraSystemProvider waypoints={markers.waypoints}>{children}</CameraSystemProvider>
}
