import type { MutationAuditContext } from "../company/company.types"
import { InventoryError } from "../inventory/inventory.errors"
import type { AttachmentRepository } from "./attachment.repository"
import type { InventoryUploadFile, InventoryStoredUpload } from "../inventory/inventory.types"
import { InventoryAttachmentStorage } from "../inventory/inventory.storage"
import { createInventoryMutationAudit, type WorkspaceAdminAuthorizer } from "../inventory/inventory-mutation-audit"

type AttachmentStorage = Pick<InventoryAttachmentStorage, "saveInvoiceAttachment" | "deleteRelativePath" | "readRelativePath">

const ALLOWED_INVOICE_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
])
const MAX_INVOICE_ATTACHMENT_COUNT = 10
const MAX_INVOICE_ATTACHMENT_SIZE = 5 * 1024 * 1024
const MAX_INVOICE_ATTACHMENT_TOTAL_SIZE = 15 * 1024 * 1024


export class AttachmentService {
  constructor(private readonly repository: AttachmentRepository, private readonly storage: AttachmentStorage, private readonly workspaceAdminAuthorizer?: WorkspaceAdminAuthorizer) {}
  private createMutationAuditContext(auditContext?: MutationAuditContext) {
    return createInventoryMutationAudit(auditContext, this.workspaceAdminAuthorizer)
  }

  /** addInvoiceAttachments. */
  async addInvoiceAttachments(invoiceGroupId: string, files: InventoryUploadFile[], auditContext?: MutationAuditContext) {
    this.createMutationAuditContext(auditContext)

    if (!this.repository.invoiceGroupExists(invoiceGroupId)) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الفاتورة المطلوبة.")
    }

    if (files.length === 0) {
      throw new InventoryError("VALIDATION", "يجب اختيار ملف واحد على الأقل.")
    }

    if (files.length > MAX_INVOICE_ATTACHMENT_COUNT) {
      throw new InventoryError("VALIDATION", "عدد الملفات المرفوعة كبير جدًا.", [
        { field: "files", message: `الحد الأقصى هو ${MAX_INVOICE_ATTACHMENT_COUNT} ملفات لكل فاتورة.` },
      ])
    }

    const totalFileSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalFileSize > MAX_INVOICE_ATTACHMENT_TOTAL_SIZE) {
      throw new InventoryError("VALIDATION", "إجمالي حجم الملفات كبير جدًا.", [
        { field: "files", message: "يرجى تقليل إجمالي حجم المرفقات قبل الرفع." },
      ])
    }

    for (const file of files) {
      if (!ALLOWED_INVOICE_ATTACHMENT_MIME_TYPES.has(file.type)) {
        throw new InventoryError("VALIDATION", `نوع الملف غير مدعوم: ${file.name}`)
      }
      if (file.size > MAX_INVOICE_ATTACHMENT_SIZE) {
        throw new InventoryError("VALIDATION", `حجم الملف كبير جدًا: ${file.name}`)
      }
    }

    const savedFiles: Array<InventoryStoredUpload> = []

    try {
      for (const file of files) {
        // Read the bytes only after every limit check passes — over-limit
        // requests are rejected before any byte-array copy is allocated
        // (issue #214: lazy bytes owned by the module, not the transport).
        const byteContent = await file.bytes()

        const saved = await this.storage.saveInvoiceAttachment({
          invoiceGroupId,
          originalName: file.name,
          bytes: byteContent,
        })

        savedFiles.push({
          id: saved.attachmentId,
          originalName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          storageKey: saved.storageKey,
          relativePath: saved.relativePath,
          sha256: saved.sha256,
        })
      }

      const attachments = this.repository.withTransaction(() =>
        savedFiles.map((file) =>
          this.repository.createAttachment({
            invoiceGroupId,
            originalName: file.originalName,
            mimeType: file.mimeType,
            byteSize: file.byteSize,
            storageKey: file.storageKey,
            relativePath: file.relativePath,
            sha256: file.sha256,
          }),
        ),
      )

      return attachments
    } catch (error) {
      await Promise.all(savedFiles.map((file) => this.storage.deleteRelativePath(file.relativePath)))
      throw error
    }
  }

  /** getAttachmentDownload. */
  async getAttachmentDownload(id: string) {
    const attachment = this.repository.getAttachmentById(id)
    if (!attachment) {
      throw new InventoryError("NOT_FOUND", "تعذر العثور على الملف المطلوب.")
    }

    const body = await this.storage.readRelativePath(attachment.relativePath)

    return {
      attachment,
      body,
    }
  }

}
