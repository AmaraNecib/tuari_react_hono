import { ORPCError } from "@orpc/server";

// Generic schema interface for validation
export interface ValidatorSchema {
  parse(input: unknown): unknown;
  parseAsync(input: unknown): Promise<unknown>;
}

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
        const zodError = error as any;
        const fieldErrors = zodError.errors?.map((err: any) => ({
          field: err.path.join("."),
          message: err.message,
        })) || [];

        throw new ORPCError("VALIDATION_ERROR", {
          message: "Invalid input: validation failed",
          fieldErrors,
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
        const zodError = error as any;
        const fieldErrors = zodError.errors?.map((err: any) => ({
          field: err.path.join("."),
          message: err.message,
        })) || [];

        throw new ORPCError("VALIDATION_ERROR", {
          message: "Invalid input: validation failed",
          fieldErrors,
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
        const zodError = error as any;
        const fieldErrors = zodError.errors?.map((err: any) => ({
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
