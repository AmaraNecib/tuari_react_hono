import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { InventoryAttachmentStorage } from "./inventory.storage"

describe("InventoryAttachmentStorage", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
  })

  async function createStorage() {
    const directory = await mkdtemp(join(tmpdir(), "tuari-inventory-storage-"))
    tempDirs.push(directory)
    return new InventoryAttachmentStorage(directory)
  }

  it("saves and reads attachments within the configured root", async () => {
    const storage = await createStorage()

    const saved = await storage.saveInvoiceAttachment({
      invoiceGroupId: "invoice-group-1",
      originalName: "invoice.pdf",
      bytes: new Uint8Array([1, 2, 3]),
    })

    const body = await storage.readRelativePath(saved.relativePath)

    expect(saved.relativePath).toMatch(/^invoice-group-1\//)
    expect(Array.from(body)).toEqual([1, 2, 3])
  })

  it("rejects attachment writes that escape the storage root", async () => {
    const storage = await createStorage()

    await expect(
      storage.saveInvoiceAttachment({
        invoiceGroupId: "../escaped",
        originalName: "invoice.pdf",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow("escaped the storage root")
  })

  it("rejects attachment reads that escape the storage root", async () => {
    const storage = await createStorage()

    await expect(storage.readRelativePath("../escaped/file.pdf")).rejects.toThrow("escaped the storage root")
  })

  it("rejects attachment deletes that escape the storage root", async () => {
    const storage = await createStorage()

    await expect(storage.deleteRelativePath("../escaped/file.pdf")).rejects.toThrow("escaped the storage root")
  })
})
