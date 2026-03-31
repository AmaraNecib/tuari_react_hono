import { describe, expect, it } from "vitest"

import { createEmptyEmployeeDraft, normalizeEmployeeDraft, validateEmployeeBatch } from "./employee-batch-schema"

describe("employee batch salary fields", () => {
  it("normalizes salary amount and period into the batch payload", () => {
    const draft = {
      ...createEmptyEmployeeDraft("role-worker"),
      firstName: "سمير",
      lastName: "بوقرة",
      phone: "0555123456",
      salaryAmountDzd: "4500",
      salaryPeriod: "DAILY" as const,
    }

    expect(normalizeEmployeeDraft(draft)).toMatchObject({
      salaryAmountDzd: 4500,
      salaryPeriod: "DAILY",
    })
  })

  it("requires a salary amount when a salary period is selected", () => {
    const draft = {
      ...createEmptyEmployeeDraft("role-worker"),
      firstName: "سمير",
      lastName: "بوقرة",
      phone: "0555123456",
      salaryPeriod: "MONTHLY" as const,
    }

    const result = validateEmployeeBatch([draft])

    expect(result.isValid).toBe(false)
    expect(result.rowErrors[0]?.salaryAmountDzd).toBe("required")
  })

  it("requires a salary period when a salary amount is entered", () => {
    const draft = {
      ...createEmptyEmployeeDraft("role-worker"),
      firstName: "سمير",
      lastName: "بوقرة",
      phone: "0555123456",
      salaryAmountDzd: "4500",
    }

    const result = validateEmployeeBatch([draft])

    expect(result.isValid).toBe(false)
    expect(result.rowErrors[0]?.salaryPeriod).toBe("required")
  })
})
