import type { AppError, AppErrorCode } from "@tuari/contracts"

/** InventoryError. */
export class InventoryError extends Error {
  readonly appError: AppError

  constructor(code: AppErrorCode, message: string, fieldErrors: AppError["fieldErrors"] = []) {
    super(message)
    this.name = "InventoryError"
    this.appError = {
      code,
      message,
      fieldErrors,
    }
  }
}

/** toFailureResult. */
export function toFailureResult(error: unknown) {
  if (error instanceof InventoryError) {
    return {
      success: false as const,
      error: error.appError,
    }
  }

  throw error
}
