/**
 * Error boundary component for catching JavaScript errors.
 * Shows fallback UI when an error occurs.
 */
import { Component, type ReactNode } from "react"

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
}

/**
 * Error boundary class component.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error.message, info.componentStack)
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            className="flex min-h-[200px] items-center justify-center p-6 text-sm text-muted-foreground"
            dir="rtl"
          >
            حدث خطأ غير متوقع. يرجى إعادة تحميل الصفحة.
          </div>
        )
      )
    }

    return this.props.children
  }
}
