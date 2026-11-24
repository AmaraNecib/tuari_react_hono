import type { ReactNode } from "react"
import { toast } from "sonner"
import { createErrorId, formatErrorCode, recordUiFailure } from "./error-correlation"

function ToastMessage({ id, message }: { id: string | number; message: ReactNode }) {
  return (
    <button
      className="block w-full cursor-pointer rounded-xl px-1 py-0.5 text-start outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={() => toast.dismiss(id)}
    >
      {message}
    </button>
  )
}

/** Shows a success toast notification. */
export function showSuccessToast(message: ReactNode) {
  const id = `toast-${crypto.randomUUID()}`
  toast.success(<ToastMessage id={id} message={message} />, { id })
  return id
}

/** Shows an error toast notification. */
export function showErrorToast(message: ReactNode) {
  const id = `toast-${crypto.randomUUID()}`
  const errorId = createErrorId()
  void recordUiFailure(errorId)
  toast.error(
    <ToastMessage
      id={id}
      message={
        <>
          {message}
          <bdi dir="ltr" className="mt-1 block font-mono text-xs">
            {formatErrorCode(errorId)}
          </bdi>
        </>
      }
    />,
    { id },
  )
  return id
}
