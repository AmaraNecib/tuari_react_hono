import { describe, expect, it } from "vitest"

import {
  MAX_INVOICE_ATTACHMENT_COUNT,
  MAX_INVOICE_ATTACHMENT_SIZE_BYTES,
  MAX_INVOICE_ATTACHMENT_TOTAL_SIZE_BYTES,
  validateInvoiceAttachmentFiles,
  type InvoiceAttachmentMessages,
} from "./invoice-attachment-rules"

const messages: InvoiceAttachmentMessages = {
  tooMany: (max) => `tooMany:${max}`,
  tooLarge: (fileName, maxMb) => `tooLarge:${fileName}:${maxMb}`,
  totalTooLarge: (maxMb) => `totalTooLarge:${maxMb}`,
  unsupportedType: (fileName) => `unsupportedType:${fileName}`,
}

function pdf(name: string, size = 16) {
  return new File([new Uint8Array(size)], name, { type: "application/pdf" })
}

describe("validateInvoiceAttachmentFiles", () => {
  it("accepts an empty selection and a valid one", () => {
    expect(validateInvoiceAttachmentFiles([], messages)).toBeNull()
    expect(validateInvoiceAttachmentFiles([pdf("facture.pdf"), pdf("scan.pdf")], messages)).toBeNull()
  })

  it("rejects a selection above the count limit", () => {
    const files = Array.from({ length: MAX_INVOICE_ATTACHMENT_COUNT + 1 }, (_, index) =>
      pdf(`f-${index}.pdf`),
    )
    expect(validateInvoiceAttachmentFiles(files, messages)).toBe(
      `tooMany:${MAX_INVOICE_ATTACHMENT_COUNT}`,
    )
  })

  it("rejects an unsupported type by file name before checking sizes", () => {
    const files = [
      new File([new Uint8Array(MAX_INVOICE_ATTACHMENT_SIZE_BYTES + 1)], "notes.txt", {
        type: "text/plain",
      }),
    ]
    expect(validateInvoiceAttachmentFiles(files, messages)).toBe("unsupportedType:notes.txt")
  })

  it("rejects a per-file size above the limit, naming the file", () => {
    const files = [pdf("big.pdf", MAX_INVOICE_ATTACHMENT_SIZE_BYTES + 1)]
    expect(validateInvoiceAttachmentFiles(files, messages)).toBe("tooLarge:big.pdf:5")
  })

  it("rejects a batch whose total exceeds the limit while each file is under it", () => {
    const perFile = 4 * 1024 * 1024
    const files = Array.from({ length: 4 }, (_, index) => pdf(`part-${index}.pdf`, perFile))
    expect(4 * perFile).toBeGreaterThan(MAX_INVOICE_ATTACHMENT_TOTAL_SIZE_BYTES)
    expect(validateInvoiceAttachmentFiles(files, messages)).toBe("totalTooLarge:15")
  })
})
