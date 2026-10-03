import type { WebGLRenderer } from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

const loaders = new WeakMap<WebGLRenderer, KTX2Loader>()

/**
 * One KTX2Loader per renderer, configured for the renderer's compressed-texture support.
 * No transcoder path is set: three's KTX2Loader then loads the Basis transcoder that ships
 * with the installed three version (bundled by Vite), so the two can never drift apart.
 */
export function getKTX2Loader(renderer: WebGLRenderer): KTX2Loader {
  let loader = loaders.get(renderer)
  if (!loader) {
    loader = new KTX2Loader().detectSupport(renderer)
    loaders.set(renderer, loader)
  }
  return loader
}

/** Human-readable GPU format families the transcoder will target on this device. */
export function describeTranscodeTarget(loader: KTX2Loader): string {
  const config = (loader as unknown as { workerConfig: Record<string, boolean> }).workerConfig
  const families = [
    config.astcSupported && 'ASTC',
    config.bptcSupported && 'BC7',
    config.dxtSupported && 'BC1/BC3',
    config.etc2Supported && 'ETC2',
    config.etc1Supported && 'ETC1',
    config.pvrtcSupported && 'PVRTC',
  ].filter(Boolean)
  return families.length > 0 ? families.join(', ') : 'RGBA32 (uncompressed)'
}
