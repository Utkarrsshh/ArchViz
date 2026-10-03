import { useEffect, useState } from 'react'
import { useCameraSystem } from '../../systems/camera/cameraContext'
import { useEnvironmentSystem } from '../../systems/environment/environmentContext'
import type {
  EnvironmentPart,
  EnvironmentStatus as Status,
  PlantRenderStats,
} from '../../systems/environment/environmentTypes'
import './EnvironmentStatus.css'

const LOADED_MESSAGE_MS = 2500
const STATS_POLL_MS = 500
const PART_LABELS: Record<EnvironmentPart, string> = {
  manifest: 'Layout',
  shell: 'Shell',
  plants: 'Plants',
  fence: 'Fence',
  props: 'Props',
}
const WAVE_LABELS = ['Loading environment…', 'Loading shell…', 'Loading vegetation and structures…', 'Loading props…']
const STATE_LABELS = { idle: 'Waiting', loading: 'Loading', ready: 'Ready', error: 'Failed' } as const

function headline(status: Status): string {
  if (status.phase === 'error') return 'Environment failed to load.'
  if (status.phase === 'ready') {
    return status.warnings.length > 0 ? `Environment ready (${status.warnings.length} issue${status.warnings.length > 1 ? 's' : ''}).` : 'Environment ready.'
  }
  return WAVE_LABELS[status.wave]
}

function snapshot(stats: PlantRenderStats): PlantRenderStats {
  return { ...stats, instancesPerLod: [...stats.instancesPerLod] }
}

/** Dev-only panel: part states, KTX2, plant LOD/culling counters (polled, not per-frame state) and waypoints. */
function DeveloperPanel({ status, stats }: { status: Status; stats: PlantRenderStats }) {
  const { markers } = useEnvironmentSystem()
  const { moveToWaypoint } = useCameraSystem()
  const [plants, setPlants] = useState(() => snapshot(stats))

  useEffect(() => {
    const id = window.setInterval(() => setPlants(snapshot(stats)), STATS_POLL_MS)
    return () => window.clearInterval(id)
  }, [stats])

  const { ktx2 } = status
  const ktx2Parts = Object.entries(ktx2.parts)
    .map(([part, state]) => {
      const failed = status.parts[part as EnvironmentPart] === 'error'
      return `${part[0].toUpperCase()}${part.slice(1)} ${failed ? 'n/a' : state}`
    })
    .join(' · ')

  return (
    <aside className="environment-dev" aria-label="Environment developer status">
      <div className="environment-dev__row environment-dev__title">
        Environment: {status.phase === 'ready' ? 'Ready' : status.phase === 'error' ? 'Failed' : `Wave ${status.wave}`}
      </div>
      <dl className="environment-dev__parts">
        {(Object.keys(PART_LABELS) as EnvironmentPart[]).map((part) => (
          <div key={part} data-state={status.parts[part]}>
            <dt>{PART_LABELS[part]}</dt>
            <dd>
              {STATE_LABELS[status.parts[part]]}
              {status.timings[part] !== undefined && ` · ${(status.timings[part]! / 1000).toFixed(2)} s`}
            </dd>
          </div>
        ))}
      </dl>
      <div className="environment-dev__row">
        KTX2: {ktx2.enabled ? 'on' : 'off'} ({ktx2.reason}){ktx2.transcodeTarget && ` → ${ktx2.transcodeTarget}`}
      </div>
      {ktx2Parts && <div className="environment-dev__row environment-dev__muted">{ktx2Parts}</div>}
      {plants.totalInstances > 0 && (
        <>
          <div className="environment-dev__row">
            LOD {plants.instancesPerLod.map((n, level) => `L${level} ${n}`).join(' · ')}
          </div>
          <div className="environment-dev__row">
            Cells {plants.visibleCells}/{plants.totalCells} ({plants.mixedCells} mixed) · draws {plants.drawCalls} ·{' '}
            {plants.totalInstances} plants
          </div>
        </>
      )}
      {status.warnings.map((warning) => (
        <div key={warning} className="environment-dev__row environment-dev__warning">
          {warning}
        </div>
      ))}
      {markers.waypoints.length > 0 && (
        <div className="environment-dev__waypoints">
          <span className="environment-dev__muted">Cameras ({markers.source}):</span>
          {markers.waypoints.map((waypoint) => (
            <button key={waypoint.id} type="button" onClick={() => void moveToWaypoint(waypoint.id)}>
              {waypoint.name}
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}

/** Loading / ready / failed overlay for the environment. Rendered outside the Canvas. */
export default function EnvironmentStatus() {
  const { status, plantStats } = useEnvironmentSystem()
  const [dismissedPhase, setDismissedPhase] = useState<string | null>(null)

  useEffect(() => {
    if (status.phase !== 'ready') return
    const id = window.setTimeout(() => setDismissedPhase('ready'), LOADED_MESSAGE_MS)
    return () => window.clearTimeout(id)
  }, [status.phase])

  const showBanner = status.phase !== 'ready' || dismissedPhase !== 'ready'

  return (
    <>
      {showBanner && (
        <div className="environment-status" data-phase={status.phase} role="status" aria-live="polite">
          <strong>{headline(status)}</strong>
          {status.error && <p>{status.error}</p>}
        </div>
      )}
      {import.meta.env.DEV && <DeveloperPanel status={status} stats={plantStats} />}
    </>
  )
}
