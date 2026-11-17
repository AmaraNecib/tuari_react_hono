import { describe, expect, it } from "vitest"

import { createEmptyEmployeeDraft, normalizeEmployeeDraft, validateEmployeeBatch } from "./employee-batch-schema"

describe("employee batch salary reference", () => {
  it("normalizes exact localized daily input without losing four decimal places", () => {
    const draft = {
      ...createEmptyEmployeeDraft("role-worker"),
      firstName: "سمير",
      lastName: "بوقرة",
      phone: "0555123456",
      salaryReferenceAmount: "١٬٢٣٤٫٥٦٧٨",
      salaryReferencePeriod: "DAILY" as const,
    }

    expect(normalizeEmployeeDraft(draft).salaryReference).toEqual({ period: "DAILY", amount: "1234.5678" })
  })

  it("keeps an empty reference distinct from a legal zero reference", () => {
    const blank = { ...createEmptyEmployeeDraft("role-worker"), firstName: "سمير", lastName: "بوقرة", phone: "0555123456" }
    const zero = { ...blank, salaryReferenceAmount: "0", salaryReferencePeriod: "MONTHLY" as const }

    expect(normalizeEmployeeDraft(blank).salaryReference).toBeNull()
    expect(normalizeEmployeeDraft(zero).salaryReference).toEqual({ period: "MONTHLY", amount: "0" })
    expect(validateEmployeeBatch([blank]).isValid).toBe(true)
    expect(validateEmployeeBatch([zero]).isValid).toBe(true)
  })

  it("normalizes an optional occupation into the batch payload", () => {
    const draft = {
      ...createEmptyEmployeeDraft("role-worker"),
      firstName: "سمير",
      lastName: "بوقرة",
      phone: "0555123456",
      occupation: "  عامل بناء  ",
    }

    expect(normalizeEmployeeDraft(draft).occupation).toBe("عامل بناء")
    expect(normalizeEmployeeDraft(createEmptyEmployeeDraft("role-worker")).occupation).toBeUndefined()
  })

  it("rejects an occupation longer than 120 characters", () => {
    const draft = {
      ...createEmptyEmployeeDraft("role-worker"),
      firstName: "سمير",
      lastName: "بوقرة",
      phone: "0555123456",
      occupation: "م".repeat(121),
    }

    const result = validateEmployeeBatch([draft])

    expect(result.isValid).toBe(false)
    expect(result.rowErrors[0]?.occupation).toBeTruthy()
  })
})
