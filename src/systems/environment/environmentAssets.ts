import { useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { EnvironmentAsset } from './environmentTypes'
import { getKTX2Loader } from './ktx2Support'

/** drei's GLTFLoader type (from three-stdlib, which is not a direct dependency). */
type GLTFLoader = Parameters<NonNullable<Parameters<typeof useGLTF>[3]>>[0]

/**
 * Loads an environment GLB: the KTX2-optimized derivative when `ktx2` is true, otherwise the
 * original PNG-embedded GLB. Node transforms, materials and glTF extensions are untouched.
 * No Draco/Meshopt: the package uses neither, and this avoids fetching decoders from a CDN.
 */
export function useEnvironmentGLTF(asset: EnvironmentAsset, ktx2: boolean) {
  const gl = useThree((state) => state.gl)
  const url = ktx2 && asset.ktx2Url ? asset.ktx2Url : asset.url
  const extendLoader = useCallback(
    (loader: GLTFLoader) => {
      // three's KTX2Loader (with the transcoder bundled from the installed three); drei's loader accepts it at runtime.
      if (ktx2) loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<GLTFLoader['setKTX2Loader']>[0])
    },
    [gl, ktx2],
  )
  return useGLTF(url, false, false, extendLoader)
}
