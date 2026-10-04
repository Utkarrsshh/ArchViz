import { useCallback, useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { useEnvironmentSystem } from '../../systems/environment/environmentContext'
import type { EnvironmentAssetKey } from '../../systems/environment/environmentTypes'
import { describeTranscodeTarget, getKTX2Loader } from '../../systems/environment/ktx2Support'
import EnvironmentAssetBoundary from './EnvironmentAssetBoundary'
import EnvironmentFence from './EnvironmentFence'
import EnvironmentPlants from './EnvironmentPlants'
import EnvironmentProps from './EnvironmentProps'
import EnvironmentShell from './EnvironmentShell'

type TranscoderGate = 'pending' | 'ready' | 'failed'

/**
 * Initialises the Basis transcoder before any KTX2 GLB is requested. GLTFLoader only logs
 * (and drops the texture) when a KTX2 texture cannot be decoded, so a broken transcoder
 * must be caught here, where it can still switch every asset to its PNG GLB.
 */
function useTranscoderGate(enabled: boolean, onFailed: (error: unknown) => void, onReady: (target: string) => void) {
  const gl = useThree((state) => state.gl)
  const [gate, setGate] = useState<TranscoderGate>('pending')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const loader = getKTX2Loader(gl)
    loader.init().then(
      () => {
        if (cancelled) return
        setGate('ready')
        onReady(describeTranscodeTarget(loader))
      },
      (error: unknown) => {
        if (cancelled) return
        setGate('failed')
        onFailed(error)
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, gl, onFailed, onReady])

  return enabled ? gate : 'failed'
}

/** Stable per-asset report callbacks (children key effects on them). */
function useAssetReports(asset: EnvironmentAssetKey) {
  const { reportPart, reportKtx2 } = useEnvironmentSystem()
  return useMemo(
    () => ({
      onReady: (usedKtx2: boolean) => {
        reportKtx2(asset, usedKtx2 ? 'ktx2' : 'png')
        reportPart(asset, 'ready')
      },
      onKtx2Fallback: () => reportKtx2(asset, 'fallback'),
      onError: (error: unknown) => reportPart(asset, 'error', error),
    }),
    [asset, reportPart, reportKtx2],
  )
}

/**
 * Canvas-side environment root, rendered in loading-wave order:
 *   wave 1  shell
 *   wave 2  plants + fence (once their binaries arrive)
 *   wave 3  props
 * Each asset has its own Suspense/error boundary with a KTX2 → PNG fallback, so a failure
 * in one never takes down the others.
 */
export default function EnvironmentScene() {
  const { definition, plantData, fenceData, plantStats, status, prefersKtx2, reportTranscoder } = useEnvironmentSystem()

  const transcoderFailed = useCallback(
    (error: unknown) => {
      console.warn('[environment] Basis transcoder unavailable; using PNG GLBs.', error)
      reportTranscoder(null)
    },
    [reportTranscoder],
  )
  const transcoderReady = useCallback((target: string) => reportTranscoder(target), [reportTranscoder])
  const gate = useTranscoderGate(status.ktx2.enabled, transcoderFailed, transcoderReady)

  const shell = useAssetReports('shell')
  const plants = useAssetReports('plants')
  const fence = useAssetReports('fence')
  const props = useAssetReports('props')

  if (!definition || gate === 'pending') return null
  const ktx2 = (key: EnvironmentAssetKey) => gate === 'ready' && prefersKtx2(key)
  const { assets, shadows } = definition
  const { parts } = status

  return (
    <>
      {assets.shell && (
        <EnvironmentAssetBoundary ktx2={ktx2('shell')} onKtx2Fallback={shell.onKtx2Fallback} onError={shell.onError}>
          {(withKtx2) => <EnvironmentShell asset={assets.shell!} ktx2={withKtx2} shadows={shadows} onReady={shell.onReady} />}
        </EnvironmentAssetBoundary>
      )}

      {parts.plants !== 'idle' && plantData && assets.plants && definition.plants && (
        <EnvironmentAssetBoundary ktx2={ktx2('plants')} onKtx2Fallback={plants.onKtx2Fallback} onError={plants.onError}>
          {(withKtx2) => (
            <EnvironmentPlants
              asset={assets.plants!}
              ktx2={withKtx2}
              plants={definition.plants!}
              cells={definition.cells}
              data={plantData}
              stats={plantStats}
              shadows={shadows}
              onReady={plants.onReady}
            />
          )}
        </EnvironmentAssetBoundary>
      )}

      {parts.fence !== 'idle' && fenceData && assets.fence && (
        <EnvironmentAssetBoundary ktx2={ktx2('fence')} onKtx2Fallback={fence.onKtx2Fallback} onError={fence.onError}>
          {(withKtx2) => (
            <EnvironmentFence
              asset={assets.fence!}
              ktx2={withKtx2}
              sets={definition.fence}
              matrices={fenceData}
              shadows={shadows}
              onReady={fence.onReady}
            />
          )}
        </EnvironmentAssetBoundary>
      )}

      {parts.props !== 'idle' && assets.props && (
        <EnvironmentAssetBoundary ktx2={ktx2('props')} onKtx2Fallback={props.onKtx2Fallback} onError={props.onError}>
          {(withKtx2) => <EnvironmentProps asset={assets.props!} ktx2={withKtx2} shadows={shadows} onReady={props.onReady} />}
        </EnvironmentAssetBoundary>
      )}
    </>
  )
}
