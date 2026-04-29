import { createHash, randomUUID } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-")
  return normalized.length > 0 ? normalized : "file"
}

export class InventoryAttachmentStorage {
  private readonly rootPath: string

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath)
  }

  private resolveWithinRoot(relativePath: string) {
    const normalizedPath = relativePath.trim()
    if (normalizedPath.length === 0) {
      throw new Error("Attachment path cannot be empty.")
    }

    const absolutePath = resolve(this.rootPath, normalizedPath)
    const pathFromRoot = relative(this.rootPath, absolutePath)

    if (pathFromRoot.length === 0 || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      throw new Error("Resolved attachment path escaped the storage root.")
    }

    return absolutePath
  }

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
    const absolutePath = this.resolveWithinRoot(relativePath)

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
    const absolutePath = this.resolveWithinRoot(relativePath)
    await unlink(absolutePath).catch(() => undefined)
  }

  async readRelativePath(relativePath: string) {
    const absolutePath = this.resolveWithinRoot(relativePath)
    return readFile(absolutePath)
  }
}
