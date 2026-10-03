import { Component, Suspense, type ReactNode } from 'react'

interface EnvironmentAssetBoundaryProps {
  /** Try the KTX2 derivative first. */
  ktx2: boolean
  /** Renders the asset; `withKtx2` is false after a KTX2 failure. */
  children: (withKtx2: boolean) => ReactNode
  /** The KTX2 attempt failed; the PNG GLB is being loaded instead. */
  onKtx2Fallback: (error: unknown) => void
  /** The asset failed outright (PNG path, or KTX2 not attempted). */
  onError: (error: unknown) => void
}

interface EnvironmentAssetBoundaryState {
  caught: boolean
  ktx2Failed: boolean
  failed: boolean
}

/**
 * Suspense + error boundary for one environment GLB with a KTX2 → PNG fallback.
 * A failure of one asset never unmounts the Canvas or its sibling assets.
 */
export default class EnvironmentAssetBoundary extends Component<
  EnvironmentAssetBoundaryProps,
  EnvironmentAssetBoundaryState
> {
  state: EnvironmentAssetBoundaryState = { caught: false, ktx2Failed: false, failed: false }

  static getDerivedStateFromError(): Partial<EnvironmentAssetBoundaryState> {
    return { caught: true }
  }

  componentDidCatch(error: unknown): void {
    if (this.props.ktx2 && !this.state.ktx2Failed) {
      console.warn('[environment] KTX2 asset failed; falling back to the PNG GLB.', error)
      this.setState({ caught: false, ktx2Failed: true })
      this.props.onKtx2Fallback(error)
    } else {
      this.setState({ failed: true })
      this.props.onError(error)
    }
  }

  render() {
    const { caught, ktx2Failed, failed } = this.state
    if (caught || failed) return null
    return <Suspense fallback={null}>{this.props.children(this.props.ktx2 && !ktx2Failed)}</Suspense>
  }
}
