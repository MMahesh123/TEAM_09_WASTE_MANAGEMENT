import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  featureName: string
}

type State = {
  hasError: boolean
}

export default class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.featureName}] UI error:`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="glass-card rounded-2xl p-8">
          <p className="text-sm font-semibold text-rose-400">
            {this.props.featureName} couldn't load
          </p>
          <p className="mt-2 text-sm text-slate-400">
            This section encountered an error. Other parts of the application can
            remain available.
          </p>
          <button
            className="mt-5 rounded-lg border border-slate-600 px-4 py-2 text-sm hover:border-emerald-400"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </section>
      )
    }

    return this.props.children
  }
}
