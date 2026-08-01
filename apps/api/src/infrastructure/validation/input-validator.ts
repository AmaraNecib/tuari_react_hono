import { ORPCError } from "@orpc/server";

// Generic schema interface for validation
export interface ValidatorSchema {
  parse(input: unknown): unknown;
  parseAsync(input: unknown): Promise<unknown>;
}

/**
 * Minimal shape of a Zod-style validation error as consumed here.
 *
 * `ValidatorSchema` is duck-typed (any validator that throws an
 * `Error` named `ZodError` with an `errors` array of `{ path, message }`
 * is accepted — including the test double), so the error is narrowed
 * structurally rather than to the concrete zod `ZodError` class (whose
 * v4 shape uses `issues` instead of `errors`).
 */
type ZodValidationError = Error & {
  errors?: Array<{ path: Array<string | number>; message: string }>;
};

/**
 * Centralized input validation using schema validators (e.g., Zod).
 * Converts validation errors to structured error responses.
 */
export class InputValidator {
  /**
   * Validate input against a schema.
   * Throws ORPCError on validation failure.
   */
  static validate<T>(input: unknown, schema: ValidatorSchema): T {
    try {
      return schema.parse(input) as T;
    } catch (error) {
      // Handle Zod errors if available
      if (error instanceof Error && error.constructor.name === "ZodError") {
        throw new ORPCError("VALIDATION", {
          message: "Invalid input: validation failed",
        });
      }
      throw error;
    }
  }

  /**
   * Validate input asynchronously.
   * Throws ORPCError on validation failure.
   */
  static async validateAsync<T>(input: unknown, schema: ValidatorSchema): Promise<T> {
    try {
      return (await schema.parseAsync(input)) as T;
    } catch (error) {
      // Handle Zod errors if available
      if (error instanceof Error && error.constructor.name === "ZodError") {
        throw new ORPCError("VALIDATION", {
          message: "Invalid input: validation failed",
        });
      }
      throw error;
    }
  }

  /**
   * Safe validation - returns result with error field instead of throwing.
   */
  static safeValidate<T>(input: unknown, schema: ValidatorSchema): {
    success: true;
    data: T;
  } | {
    success: false;
    fieldErrors: Array<{ field: string; message: string }>;
  } {
    try {
      return {
        success: true,
        data: schema.parse(input) as T,
      };
    } catch (error) {
      // Handle Zod errors if available
      if (error instanceof Error && error.constructor.name === "ZodError") {
        const zodError = error as ZodValidationError;
        const fieldErrors = zodError.errors?.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        })) || [];
        return {
          success: false,
          fieldErrors,
        };
      }
      throw error;
    }
  }
}
