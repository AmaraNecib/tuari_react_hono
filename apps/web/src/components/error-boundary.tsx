/**
 * Error boundary component for catching JavaScript errors.
 * Shows fallback UI when an error occurs.
 */
import { Component, type ReactNode } from "react"
import { createErrorId, formatErrorCode, recordUiFailure } from "@/lib/error-correlation"

/**
 * Error boundary props interface.
 */
interface Props {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Error boundary state interface.
 */
interface State {
  hasError: boolean
  errorId: number | null
}

/**
 * Error boundary class component.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorId: null }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, errorId: null }
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error.message, info.componentStack)
    const errorId = createErrorId()
    this.setState({ errorId })
    void recordUiFailure(errorId)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div>
        {this.props.fallback ?? (
          <div
            className="flex min-h-[200px] items-center justify-center p-6 text-sm text-muted-foreground"
            dir="rtl"
          >
            حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة.
          </div>
        )}
        {this.state.errorId !== null && <bdi dir="ltr" className="block text-center font-mono text-sm">{formatErrorCode(this.state.errorId)}</bdi>}
        </div>
      )
    }

    return this.props.children
  }
}
