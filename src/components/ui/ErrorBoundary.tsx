'use client'
import { Component, ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-3 px-6 text-center">
          <p className="text-[13px] text-white/40">Something went wrong loading this page.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-[11px] text-rs-blue-fusion/70 underline"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
