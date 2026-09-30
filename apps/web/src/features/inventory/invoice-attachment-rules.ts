/**
 * Client-side mirror of the invoice-attachment limits owned by
 * `InventoryService` (`apps/api/src/modules/inventory/inventory.service.ts`).
 *
 * The server stays authoritative; this copy exists so the operator learns a
 * file was rejected *before* an invoice is created, with the offending file
 * named and the reason localized. The numbers must stay in lockstep with the
 * server constants.
 */

/** The `accept` attribute for the invoice attachment input. */
export const INVOICE_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp"

export const ALLOWED_INVOICE_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export const MAX_INVOICE_ATTACHMENT_COUNT = 10
export const MAX_INVOICE_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_INVOICE_ATTACHMENT_TOTAL_SIZE_BYTES = 15 * 1024 * 1024

const MB = 1024 * 1024

/** Localized messages the validator needs; the page supplies them from i18n. */
export type InvoiceAttachmentMessages = {
  tooMany: (max: number) => string
  tooLarge: (fileName: string, maxMb: number) => string
  totalTooLarge: (maxMb: number) => string
  unsupportedType: (fileName: string) => string
}

/**
 * Returns the first localized rejection message for the selection, or `null`
 * when the files satisfy every limit. Count and type are checked before any
 * size arithmetic, and each per-file message names the file.
 */
export function validateInvoiceAttachmentFiles(
  files: readonly File[],
  messages: InvoiceAttachmentMessages,
): string | null {
  if (files.length > MAX_INVOICE_ATTACHMENT_COUNT) {
    return messages.tooMany(MAX_INVOICE_ATTACHMENT_COUNT)
  }

  for (const file of files) {
    if (!ALLOWED_INVOICE_ATTACHMENT_MIME_TYPES.has(file.type)) {
      return messages.unsupportedType(file.name)
    }
  }

  for (const file of files) {
    if (file.size > MAX_INVOICE_ATTACHMENT_SIZE_BYTES) {
      return messages.tooLarge(file.name, MAX_INVOICE_ATTACHMENT_SIZE_BYTES / MB)
    }
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > MAX_INVOICE_ATTACHMENT_TOTAL_SIZE_BYTES) {
    return messages.totalTooLarge(MAX_INVOICE_ATTACHMENT_TOTAL_SIZE_BYTES / MB)
  }

  return null
}
