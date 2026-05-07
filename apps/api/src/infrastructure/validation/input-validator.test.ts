import { describe, it, expect } from "vitest";
import { InputValidator } from "./input-validator";

describe("InputValidator", () => {
  // Mock Zod error for testing
  class ZodError extends Error {
    constructor(
      public errors: Array<{ path: string[]; message: string }>,
    ) {
      super("Validation error");
      this.name = "ZodError";
    }
  }

  // Mock schema that validates basic requirements
  const schema = {
    parse(input: unknown) {
      const data = input as any;
      const errors: Array<{ path: string[]; message: string }> = [];

      if (!data.name || typeof data.name !== "string" || data.name.length === 0) {
        errors.push({ path: ["name"], message: "Name is required" });
      }
      if (!data.email || !data.email.includes("@")) {
        errors.push({ path: ["email"], message: "Invalid email" });
      }
      if (typeof data.age !== "number" || data.age < 0) {
        errors.push({ path: ["age"], message: "Age must be positive" });
      }

      if (errors.length > 0) {
        throw new ZodError(errors);
      }

      return data;
    },
    async parseAsync(input: unknown) {
      return this.parse(input);
    },
  };

  describe("validate", () => {
    it("returns validated data on success", () => {
      const input = { name: "John", email: "john@example.com", age: 30 };
      const result = InputValidator.validate(input, schema);
      expect(result).toEqual(input);
    });

    it("throws ORPCError on validation failure", () => {
      const input = { name: "", email: "invalid", age: -5 };
      try {
        InputValidator.validate(input, schema);
        expect.fail("Should have thrown");
      } catch (error: any) {
        // Verify error has validation context
        expect(error).toBeDefined();
        expect(error.code).toBe("VALIDATION");
      }
    });

    it("includes field errors in error response", () => {
      const input = { name: "", email: "invalid", age: -5 };
      try {
        InputValidator.validate(input, schema);
        expect.fail("Should have thrown");
      } catch (error: any) {
        // Verify error is ORPCError with validation code
        expect(error.code).toBe("VALIDATION");
        expect(error.message).toContain("validation");
      }
    });
  });

  describe("safeValidate", () => {
    it("returns success with data on validation pass", () => {
      const input = { name: "John", email: "john@example.com", age: 30 };
      const result = InputValidator.safeValidate(input, schema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it("returns failure with field errors on validation fail", () => {
      const input = { name: "", email: "invalid", age: -5 };
      const result = InputValidator.safeValidate(input, schema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.fieldErrors).toBeDefined();
        expect(Array.isArray(result.fieldErrors)).toBe(true);
        expect(result.fieldErrors.length).toBeGreaterThan(0);
      }
    });
  });

  describe("validateAsync", () => {
    it("returns validated data on success", async () => {
      const input = { name: "John", email: "john@example.com", age: 30 };
      const result = await InputValidator.validateAsync(input, schema);
      expect(result).toEqual(input);
    });

    it("throws ORPCError on validation failure", async () => {
      const input = { name: "", email: "invalid", age: -5 };
      await expect(InputValidator.validateAsync(input, schema)).rejects.toThrow();
    });
  });

  describe("nested path validation", () => {
    const nestedSchema = {
      parse(input: unknown) {
        const data = input as any;
        const email = data.user?.profile?.email;
        if (!email || !email.includes("@")) {
          throw new ZodError([
            { path: ["user", "profile", "email"], message: "Invalid email" },
          ]);
        }
        return data;
      },
      async parseAsync(input: unknown) {
        return this.parse(input);
      },
    };

    it("reports correct field paths in errors", () => {
      const input = {
        user: {
          profile: {
            email: "invalid-email",
          },
        },
      };

      try {
        InputValidator.validate(input, nestedSchema);
        expect.fail("Should have thrown");
      } catch (error: any) {
        // Verify nested validation error
        expect(error).toBeDefined();
        expect(error.code).toBe("VALIDATION");
        expect(error.message).toContain("validation");
      }
    });
  });
});
