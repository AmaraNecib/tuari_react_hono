import { describe, expect, it, vi } from "vitest"

import { InventoryError } from "./inventory.errors"
import type { InventoryRepository } from "./inventory.repository"
import { InventoryService } from "./inventory.service"
import type { InventoryAttachmentStorage } from "./inventory.storage"
import type { InventoryUploadFile } from "./inventory.types"

const ALLOWED_MIME = "application/pdf"

const makeFile = (name: string, size: number): InventoryUploadFile => ({
  name,
  type: ALLOWED_MIME,
  size,
  bytes: () => Promise.resolve(new Uint8Array(0)),
})

const createService = (overrides: {
  getInvoiceGroupById?: InventoryRepository["getInvoiceGroupById"]
  saveInvoiceAttachment?: InventoryAttachmentStorage["saveInvoiceAttachment"]
  createAttachment?: InventoryRepository["createAttachment"]
}) => {
  // addInvoiceAttachments only touches getInvoiceGroupById / withTransaction /
  // createAttachment — keep the repository double minimal so an unrelated
  // port method added to the interface cannot break this test's type-check.
  const repository = {
    getInvoiceGroupById: overrides.getInvoiceGroupById ?? (() => ({ id: "group-1" }) as never),
    withTransaction: vi.fn((callback: () => unknown) => callback()) as InventoryRepository["withTransaction"],
    createAttachment: overrides.createAttachment ?? (vi.fn((data) => ({ id: "att-1", ...data })) as never),
  } as unknown as InventoryRepository

  const storage: InventoryAttachmentStorage = {
    saveInvoiceAttachment: overrides.saveInvoiceAttachment ??
      (async () => ({
        attachmentId: "att-1",
        storageKey: "att-1-file",
        relativePath: "group-1/att-1-file",
        sha256: "abc123",
      })),
    deleteRelativePath: vi.fn(async () => undefined),
    readRelativePath: vi.fn(async () => new Uint8Array(0)),
  } as unknown as InventoryAttachmentStorage

  return new InventoryService(repository, storage)
}

describe("InventoryService.addInvoiceAttachments — attachment limits owned by the module", () => {
  it("rejects more than 10 files with the count-limit validation error", async () => {
    const service = createService({})

    const files = Array.from({ length: 11 }, (_, index) => makeFile(`file-${index}.pdf`, 100))

    await expect(service.addInvoiceAttachments("group-1", files, {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })).rejects.toMatchObject({
      name: "InventoryError",
      appError: {
        code: "VALIDATION",
        message: "عدد الملفات المرفوعة كبير جدًا.",
        fieldErrors: [{ field: "files", message: "الحد الأقصى هو 10 ملفات لكل فاتورة." }],
      },
    })
  })

  it("accepts exactly 10 files (the count boundary is inclusive)", async () => {
    const createAttachment = vi.fn((data) => ({ id: "att-1", ...data }))
    const saveInvoiceAttachment = vi.fn(async () => ({
      attachmentId: "att-1",
      storageKey: "att-1-file",
      relativePath: "group-1/att-1-file",
      sha256: "abc123",
    }))
    const service = createService({ createAttachment, saveInvoiceAttachment })

    const files = Array.from({ length: 10 }, (_, index) => makeFile(`file-${index}.pdf`, 100))

    const attachments = await service.addInvoiceAttachments("group-1", files, {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })

    expect(attachments).toHaveLength(10)
    expect(createAttachment).toHaveBeenCalledTimes(10)
  })

  it("rejects a total size above 15 MB with the total-size validation error", async () => {
    const service = createService({})

    const sixMb = 6 * 1024 * 1024
    const files = [
      makeFile("a.pdf", sixMb),
      makeFile("b.pdf", sixMb),
      makeFile("c.pdf", sixMb),
    ]

    await expect(service.addInvoiceAttachments("group-1", files, {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })).rejects.toMatchObject({
      name: "InventoryError",
      appError: {
        code: "VALIDATION",
        message: "إجمالي حجم الملفات كبير جدًا.",
        fieldErrors: [{ field: "files", message: "يرجى تقليل إجمالي حجم المرفقات قبل الرفع." }],
      },
    })
  })

  it("rejects a single file above the 5 MB per-file limit", async () => {
    const service = createService({})

    const file = makeFile("big.pdf", 5 * 1024 * 1024 + 1)

    await expect(service.addInvoiceAttachments("group-1", [file], {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })).rejects.toMatchObject({
      name: "InventoryError",
      appError: {
        code: "VALIDATION",
        message: "حجم الملف كبير جدًا: big.pdf",
      },
    })
  })

  it("rejects a request with zero files (the route no longer guards this path)", async () => {
    const service = createService({})

    await expect(service.addInvoiceAttachments("group-1", [], {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })).rejects.toMatchObject({
      name: "InventoryError",
      appError: {
        code: "VALIDATION",
        message: "يجب اختيار ملف واحد على الأقل.",
      },
    })
  })

  it("does not load file bytes for an over-limit request (lazy buffering is module-owned)", async () => {
    // Greptile P2: the transport used to allocate a byte-array copy for every
    // submitted file BEFORE the count/total checks. Now the service rejects
    // before calling any file's bytes loader — a loader that fails loudly
    // proves it is never invoked on the rejected path.
    const service = createService({})
    const files = Array.from({ length: 11 }, (_, index) => ({
      name: `file-${index}.pdf`,
      type: ALLOWED_MIME,
      size: 100,
      bytes: () => Promise.reject(new Error("bytes must not be read on the rejected path")),
    }))

    await expect(service.addInvoiceAttachments("group-1", files, {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })).rejects.toMatchObject({
      name: "InventoryError",
      appError: { code: "VALIDATION" },
    })
  })

  it("loads file bytes only for files that pass validation (happy path reads each loader)", async () => {
    const saveInvoiceAttachment = vi.fn(async (_args: { bytes: Uint8Array }) => ({
      attachmentId: "att-1",
      storageKey: "att-1-file",
      relativePath: "group-1/att-1-file",
      sha256: "abc123",
    }))
    const service = createService({ saveInvoiceAttachment })
    const bytesSpy = vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3])))
    const file: InventoryUploadFile = { name: "a.pdf", type: ALLOWED_MIME, size: 3, bytes: bytesSpy }

    await service.addInvoiceAttachments("group-1", [file], {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })

    expect(bytesSpy).toHaveBeenCalledTimes(1)
    expect(saveInvoiceAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: new Uint8Array([1, 2, 3]) }),
    )
  })

  it("persists an in-limit upload via the repository and returns the saved attachments", async () => {
    const createAttachment = vi.fn((data) => ({ id: "att-1", ...data }))

    const service = createService({ createAttachment })

    const attachment = await service.addInvoiceAttachments("group-1", [makeFile("invoice.pdf", 1024)], {
      actorUserId: "user-1",
      actorLabel: "User",
      transactionId: "tx-1",
    })

    expect(attachment).toHaveLength(1)
    expect(attachment[0]).toMatchObject({
      id: "att-1",
      originalName: "invoice.pdf",
      mimeType: ALLOWED_MIME,
      byteSize: 1024,
      relativePath: "group-1/att-1-file",
      sha256: "abc123",
    })
    expect(createAttachment).toHaveBeenCalledWith({
      invoiceGroupId: "group-1",
      originalName: "invoice.pdf",
      mimeType: ALLOWED_MIME,
      byteSize: 1024,
      storageKey: "att-1-file",
      relativePath: "group-1/att-1-file",
      sha256: "abc123",
    })
  })
})
