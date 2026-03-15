import type { AppError, AppErrorCode } from "@tuari/contracts";

export class CompanyError extends Error {
  readonly appError: AppError;

  constructor(code: AppErrorCode, message: string, fieldErrors: AppError["fieldErrors"] = []) {
    super(message);
    this.name = "CompanyError";
    this.appError = {
      code,
      message,
      fieldErrors,
    };
  }
}

export function toFailureResult<T>(error: unknown) {
  if (error instanceof CompanyError) {
    return {
      success: false as const,
      error: error.appError,
    };
  }

  throw error;
}
