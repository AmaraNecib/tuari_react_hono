import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

const faults = vi.hoisted(() => ({ linkFailure: false }))
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, link: (...args: Parameters<typeof actual.link>) => {
    if (faults.linkFailure) return Promise.reject(Object.assign(new Error("unsupported"), { code: "ENOTSUP" }))
    return actual.link(...args)
  } }
})

import { InventoryAttachmentStorage } from "./inventory.storage"

describe("InventoryAttachmentStorage", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    faults.linkFailure = false
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

  it("stores bytes once in an immutable content-addressed object and keeps deletion from removing it", async () => {
    const storage = await createStorage()
    const first = await storage.saveInvoiceAttachment({ invoiceGroupId: "group", originalName: "invoice.pdf", bytes: new Uint8Array([1, 2, 3]) })
    const second = await storage.saveInvoiceAttachment({ invoiceGroupId: "group", originalName: "copy.pdf", bytes: new Uint8Array([1, 2, 3]) })
    const objectPath = join(tempDirs[tempDirs.length - 1]!, "attachments-store", first.sha256, "object")

    expect(second.sha256).toBe(first.sha256)
    expect((await stat(objectPath)).ino).toBe((await stat(join(tempDirs[tempDirs.length - 1]!, first.relativePath))).ino)
    await storage.deleteRelativePath(first.relativePath)
    expect(Array.from(await readFile(objectPath))).toEqual([1, 2, 3])
  })

  it("preserves the earlier immutable object when the same attachment id is uploaded again", async () => {
    const storage = await createStorage()
    const first = await storage.saveInvoiceAttachment({ attachmentId: "same", invoiceGroupId: "group", originalName: "invoice.pdf", bytes: new Uint8Array([1]) })
    const second = await storage.saveInvoiceAttachment({ attachmentId: "same", invoiceGroupId: "group", originalName: "invoice.pdf", bytes: new Uint8Array([2]) })

    expect(first.sha256).not.toBe(second.sha256)
    expect(Array.from(await readFile(join(tempDirs[tempDirs.length - 1]!, "attachments-store", first.sha256, "object")))).toEqual([1])
  })

  it("never replaces an existing object when hard links are unsupported", async () => {
    const storage = await createStorage()
    const args = { invoiceGroupId: "group", originalName: "a.txt", bytes: Buffer.from("retained") }
    const first = await storage.saveInvoiceAttachment(args)
    const objectPath = join(tempDirs[tempDirs.length - 1]!, "attachments-store", first.sha256, "object")
    const before = await stat(objectPath)
    faults.linkFailure = true
    await storage.saveInvoiceAttachment({ ...args, originalName: "b.txt" })
    expect((await stat(objectPath)).ino).toBe(before.ino)
    expect(await readFile(objectPath, "utf8")).toBe("retained")
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
