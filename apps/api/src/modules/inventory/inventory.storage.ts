import { createHash, randomUUID } from "node:crypto"
import { constants, copyFile, link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100)
  return normalized.length > 0 ? normalized : "file"
}

/** InventoryAttachmentStorage. */
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
    const sha256 = createHash("sha256").update(args.bytes).digest("hex")
    const relativePath = `${args.invoiceGroupId}/${sha256}-${storageKey}`
    const absolutePath = this.resolveWithinRoot(relativePath)
    const objectRelativePath = `attachments-store/${sha256}/object`
    const objectPath = this.resolveWithinRoot(objectRelativePath)

    await mkdir(dirname(objectPath), { recursive: true })
    const temporary = `${objectPath}.${randomUUID()}`
    await writeFile(temporary, args.bytes, { flag: "wx" })
    try {
      // Publish complete bytes without replacing an already-linked object.
      try {
        await link(temporary, objectPath)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "EEXIST") {
          if (createHash("sha256").update(await readFile(objectPath)).digest("hex") !== sha256) {
            throw new Error("Attachment object hash mismatch")
          }
        } else if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "EMLINK", "ENOSYS"].includes(code ?? "")) {
          try {
            const existing = await readFile(objectPath)
            if (createHash("sha256").update(existing).digest("hex") !== sha256) {
              throw new Error("Attachment object hash mismatch")
            }
          } catch (readError) {
            if ((readError as NodeJS.ErrnoException).code !== "ENOENT") throw readError
            // The temporary is complete and on the same filesystem. Concurrent
            // publishers have identical digest-addressed bytes; replacing the name
            // never mutates any inode already linked into an older snapshot.
            try {
              await rename(temporary, objectPath)
            } catch (publishError) {
              // Windows can refuse replacement while another publisher reads it.
              const winner = await readFile(objectPath).catch(() => { throw publishError })
              if (createHash("sha256").update(winner).digest("hex") !== sha256) throw publishError
            }
          }
        } else throw error
      }
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
    await mkdir(dirname(absolutePath), { recursive: true })
    await unlink(absolutePath).catch(() => undefined)
    try {
      await link(objectPath, absolutePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "EMLINK", "ENOSYS"].includes(code ?? "")) throw error
      await copyFile(objectPath, absolutePath, constants.COPYFILE_EXCL)
      console.warn(`[attachment] hard link unavailable (${code}); copied ${relativePath}`)
    }

    return {
      attachmentId,
      storageKey,
      relativePath,
      sha256,
    }
  }

  async deleteRelativePath(relativePath: string) {
    const absolutePath = this.resolveWithinRoot(relativePath)
    if (relativePath.startsWith("attachments-store/")) return
    await unlink(absolutePath).catch(() => undefined)
  }

  async readRelativePath(relativePath: string) {
    const absolutePath = this.resolveWithinRoot(relativePath)
    return readFile(absolutePath)
  }
}
