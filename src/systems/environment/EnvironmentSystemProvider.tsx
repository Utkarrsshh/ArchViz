import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CAMERA_WAYPOINTS } from '../../config/camera'
import { ENVIRONMENT_CONFIG, type EnvironmentConfig } from '../../config/environment'
import { PROPERTY_PINS } from '../../config/pins'
import {
  EnvironmentSystemContext,
  type EnvironmentMarkers,
  type EnvironmentSystemValue,
} from './environmentContext'
import { loadEnvironmentManifest } from './environmentLoader'
import type {
  EnvironmentAssetKey,
  EnvironmentDefinition,
  EnvironmentPart,
  EnvironmentStatus,
  EnvironmentWave,
  Ktx2PartState,
  Ktx2Status,
  PartState,
  PlantInstanceData,
} from './environmentTypes'
import { loadInstanceMatrices, loadPlantInstances } from './plantInstanceLoader'
import { createPlantRenderStats } from './spatialCulling'

interface EnvironmentSystemProviderProps {
  children: ReactNode
  config?: EnvironmentConfig
}

type Parts = Record<EnvironmentPart, PartState>

const INITIAL_PARTS: Parts = { manifest: 'loading', shell: 'idle', plants: 'idle', fence: 'idle', props: 'idle' }
const INITIAL_KTX2: Ktx2Status = { enabled: false, reason: 'pending', transcodeTarget: null, parts: {} }
/** Layout and shell are critical; everything else degrades gracefully. */
const CRITICAL_PARTS: readonly EnvironmentPart[] = ['manifest', 'shell']
const ASSET_KEYS: readonly EnvironmentAssetKey[] = ['shell', 'plants', 'fence', 'props']

const PENDING_MARKERS: EnvironmentMarkers = { source: 'pending', waypoints: [], pins: [] }
const CONFIG_MARKERS: EnvironmentMarkers = { source: 'config', waypoints: CAMERA_WAYPOINTS, pins: PROPERTY_PINS }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isSettled(state: PartState): boolean {
  return state === 'ready' || state === 'error'
}

/** A KTX2 derivative counts as present only if it is served as a binary (not an SPA HTML fallback). */
async function isServed(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal })
    return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html')
  } catch (error) {
    if (isAbort(error)) throw error
    return false
  }
}

async function resolveKtx2(definition: EnvironmentDefinition, signal: AbortSignal): Promise<Ktx2Status> {
  if (new URLSearchParams(window.location.search).get('ktx2') === '0') {
    return { ...INITIAL_KTX2, reason: 'disabled by ?ktx2=0' }
  }
  const candidates = ASSET_KEYS.filter((key) => definition.assets[key]?.ktx2Url)
  if (candidates.length === 0) return { ...INITIAL_KTX2, reason: 'no optimized.ktx2 entries in layout.json' }

  const served = await Promise.all(candidates.map((key) => isServed(definition.assets[key]!.ktx2Url!, signal)))
  const parts: Partial<Record<EnvironmentAssetKey, Ktx2PartState>> = {}
  candidates.forEach((key, i) => {
    parts[key] = served[i] ? 'pending' : 'png'
  })
  const available = served.filter(Boolean).length
  return {
    enabled: available > 0,
    reason: `${available}/${candidates.length} optimized GLBs found`,
    transcodeTarget: null,
    parts,
  }
}

/**
 * Loads an environment package in deterministic waves, outside the Canvas:
 *
 *   wave 1  layout.json, then shell.glb (Canvas)               - first pixels
 *   wave 2  plant + fence binaries, plants.glb, fence.glb       - starts once the shell settles
 *   wave 3  props.glb                                           - starts once plants and fence settle
 *
 * GLBs load inside the Canvas (EnvironmentScene) and report back through reportPart.
 * A failure in plants, fence or props is recorded as a warning; the rest keeps loading.
 */
export default function EnvironmentSystemProvider({
  children,
  config = ENVIRONMENT_CONFIG,
}: EnvironmentSystemProviderProps) {
  const [definition, setDefinition] = useState<EnvironmentDefinition | null>(null)
  const [plantData, setPlantData] = useState<PlantInstanceData | null>(null)
  const [fenceData, setFenceData] = useState<Record<string, Float32Array> | null>(null)
  const [parts, setParts] = useState<Parts>(INITIAL_PARTS)
  const [wave, setWave] = useState<EnvironmentWave>(0)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const [timings, setTimings] = useState<EnvironmentStatus['timings']>({})
  const [ktx2, setKtx2] = useState<Ktx2Status>(INITIAL_KTX2)
  const [plantStats] = useState(createPlantRenderStats)

  /** Imperative loading state shared by the wave triggers (not rendered). */
  const runRef = useRef({
    signal: null as AbortSignal | null,
    definition: null as EnvironmentDefinition | null,
    startedAt: 0,
    settled: { ...INITIAL_PARTS } as Parts,
    wave2: false,
    wave3: false,
  })

  const settle = useCallback((part: EnvironmentPart, state: PartState, cause?: unknown) => {
    const run = runRef.current
    if (run.settled[part] === state) return
    run.settled[part] = state
    setParts((current) => (current[part] === state ? current : { ...current, [part]: state }))
    if (isSettled(state)) {
      const elapsed = Math.round(performance.now() - run.startedAt)
      setTimings((current) => ({ ...current, [part]: elapsed }))
    }
    if (state === 'error') {
      const message = `${part}: ${describe(cause)}`
      console.error(`[environment] ${message}`, cause)
      if (CRITICAL_PARTS.includes(part)) setError((current) => current ?? message)
      else setWarnings((current) => [...current, message])
    }
  }, [])

  const startWave3 = useCallback(() => {
    const run = runRef.current
    if (run.wave3 || !run.definition) return
    run.wave3 = true
    setWave(3)
    if (run.definition.assets.props) settle('props', 'loading')
    else settle('props', 'ready') // package has no props
  }, [settle])

  const maybeStartWave3 = useCallback(() => {
    const { settled } = runRef.current
    if (isSettled(settled.plants) && isSettled(settled.fence)) startWave3()
  }, [startWave3])

  const startWave2 = useCallback(() => {
    const run = runRef.current
    const { definition: loaded, signal } = run
    if (run.wave2 || !loaded || !signal) return
    run.wave2 = true
    setWave(2)

    const fail = (part: EnvironmentPart) => (cause: unknown) => {
      if (isAbort(cause) || signal.aborted) return
      settle(part, 'error', cause)
      maybeStartWave3()
    }

    settle('plants', 'loading')
    loadPlantInstances(loaded.plants, signal).then((data) => {
      if (!signal.aborted) setPlantData(data)
    }, fail('plants'))

    if (!loaded.assets.fence || loaded.fence.length === 0) {
      settle('fence', 'ready') // package has no fence
      maybeStartWave3()
      return
    }
    settle('fence', 'loading')
    Promise.all(loaded.fence.map((set) => loadInstanceMatrices(set.matricesUrl, set.count, signal))).then(
      (matrices) => {
        if (signal.aborted) return
        setFenceData(Object.fromEntries(loaded.fence.map((set, i) => [set.key, matrices[i]])))
      },
      fail('fence'),
    )
  }, [settle, maybeStartWave3])

  const reportPart = useCallback<EnvironmentSystemValue['reportPart']>(
    (part, state, cause) => {
      settle(part, state, cause)
      if (part === 'shell' && isSettled(state)) startWave2()
      if ((part === 'plants' || part === 'fence') && isSettled(state)) maybeStartWave3()
    },
    [settle, startWave2, maybeStartWave3],
  )

  const reportKtx2 = useCallback<EnvironmentSystemValue['reportKtx2']>((asset, state) => {
    setKtx2((current) => {
      const previous = current.parts[asset]
      if (previous === undefined) return current // no KTX2 derivative for this asset
      // An asset that was waiting for KTX2 but rendered from PNG has fallen back.
      const next = state === 'png' && (previous === 'pending' || previous === 'fallback') ? 'fallback' : state
      return previous === next ? current : { ...current, parts: { ...current.parts, [asset]: next } }
    })
  }, [])

  const reportTranscoder = useCallback<EnvironmentSystemValue['reportTranscoder']>((target) => {
    setKtx2((current) => {
      if (target !== null) return { ...current, transcodeTarget: target }
      const parts = Object.fromEntries(
        Object.entries(current.parts).map(([key, state]) => [key, state === 'pending' ? 'fallback' : state]),
      )
      return { ...current, enabled: false, reason: 'Basis transcoder failed to initialise', parts }
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const run = runRef.current
    Object.assign(run, {
      signal,
      definition: null,
      startedAt: performance.now(),
      settled: { ...INITIAL_PARTS },
      wave2: false,
      wave3: false,
    })

    loadEnvironmentManifest(config.baseUrl, config.manifestFile, signal)
      .then(async (loaded) => {
        const ktx2Status = await resolveKtx2(loaded, signal)
        if (signal.aborted) return
        run.definition = loaded
        setKtx2(ktx2Status)
        setDefinition(loaded)
        setWave(1)
        settle('manifest', 'ready')
        settle('shell', 'loading')
      })
      .catch((cause) => {
        if (isAbort(cause) || signal.aborted) return
        settle('manifest', 'error', cause)
      })

    return () => {
      controller.abort()
      setDefinition(null)
      setPlantData(null)
      setFenceData(null)
      setParts(INITIAL_PARTS)
      setWave(0)
      setError(null)
      setWarnings([])
      setTimings({})
      setKtx2(INITIAL_KTX2)
    }
  }, [config, settle])

  const status = useMemo<EnvironmentStatus>(() => {
    const states = Object.values(parts)
    const phase = error ? 'error' : states.every(isSettled) ? 'ready' : 'loading'
    return { phase, wave, parts, error, warnings, timings, ktx2 }
  }, [parts, wave, error, warnings, timings, ktx2])

  // Blender markers drive the camera waypoints and pins when the package has them;
  // otherwise (older export, or layout.json failed) the development config is used.
  const markers = useMemo<EnvironmentMarkers>(() => {
    if (definition?.markers) return { source: 'blender', waypoints: definition.markers.cameras, pins: definition.markers.pins }
    if (definition || parts.manifest === 'error') return CONFIG_MARKERS
    return PENDING_MARKERS
  }, [definition, parts.manifest])

  const prefersKtx2 = useCallback(
    (asset: EnvironmentAssetKey) => ktx2.enabled && (ktx2.parts[asset] === 'pending' || ktx2.parts[asset] === 'ktx2'),
    [ktx2],
  )

  const value = useMemo<EnvironmentSystemValue>(
    () => ({ status, definition, plantData, fenceData, plantStats, markers, prefersKtx2, reportPart, reportKtx2, reportTranscoder }),
    [status, definition, plantData, fenceData, plantStats, markers, prefersKtx2, reportPart, reportKtx2, reportTranscoder],
  )

  return <EnvironmentSystemContext value={value}>{children}</EnvironmentSystemContext>
}
