import type { AppError, AppErrorCode } from "@tuari/contracts";

/**
 * ProjectCostError — the project-cost module's typed domain error, mapped to
 * the shared failure envelope by the RPC handler (mirrors InventoryError /
 * CompanyError).
 */
export class ProjectCostError extends Error {
  readonly appError: AppError;

  constructor(code: AppErrorCode, message: string, fieldErrors: AppError["fieldErrors"] = []) {
    super(message);
    this.name = "ProjectCostError";
    this.appError = {
      code,
      message,
      fieldErrors,
    };
  }
}

export function toFailureResult(error: unknown) {
  if (error instanceof ProjectCostError) {
    return {
      success: false as const,
      error: error.appError,
    };
  }

  throw error;
}
