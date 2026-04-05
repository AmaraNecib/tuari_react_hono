import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-")
  return normalized.length > 0 ? normalized : "file"
}

export class InventoryAttachmentStorage {
  private readonly rootPath = resolve(process.cwd(), "data", "attachments", "invoices")

  async saveInvoiceAttachment(args: {
    attachmentId?: string
    invoiceGroupId: string
    originalName: string
    bytes: Uint8Array
  }) {
    const attachmentId = args.attachmentId ?? randomUUID()
    const safeName = sanitizeFileName(args.originalName)
    const storageKey = `${attachmentId}-${safeName}`
    const relativePath = `${args.invoiceGroupId}/${storageKey}`
    const absolutePath = resolve(this.rootPath, relativePath)

    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, args.bytes)

    return {
      attachmentId,
      storageKey,
      relativePath,
      sha256: createHash("sha256").update(args.bytes).digest("hex"),
    }
  }

  async deleteRelativePath(relativePath: string) {
    const absolutePath = resolve(this.rootPath, relativePath)
    await unlink(absolutePath).catch(() => undefined)
  }

  async readRelativePath(relativePath: string) {
    const absolutePath = resolve(this.rootPath, relativePath)
    return readFile(absolutePath)
  }
}
