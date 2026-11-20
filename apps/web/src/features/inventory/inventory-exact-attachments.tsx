import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { InventoryInvoiceAttachment } from "@tuari/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { downloadDesktopApiFile } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { resolveApiUrl } from "@/lib/runtime-config"
import { uploadInvoiceAttachments } from "./inventory-hooks"
import { INVOICE_ATTACHMENT_ACCEPT, validateInvoiceAttachmentFiles } from "./invoice-attachment-rules"

export function usePurchaseAttachmentDraft() {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const validation = validateInvoiceAttachmentFiles(files, {
    tooMany: max => t("inventory.invoiceCreate.attachmentTooMany", { max }),
    tooLarge: (fileName, maxMb) => t("inventory.invoiceCreate.attachmentTooLarge", { fileName, maxMb }),
    totalTooLarge: maxMb => t("inventory.invoiceCreate.attachmentTotalTooLarge", { maxMb }),
    unsupportedType: fileName => t("inventory.invoiceCreate.attachmentUnsupportedType", { fileName }),
  })
  async function upload(id: string) {
    if (validation) throw new Error(validation)
    setPending(true); setError(null)
    try { if (files.length) await uploadInvoiceAttachments(id, files) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("inventory.invoiceCreate.attachmentsUploadFailed")); throw cause }
    finally { setPending(false) }
  }
  return { files, setFiles, error: validation ?? error, pending, upload, valid: !validation }
}

export function PurchaseAttachmentFiles({ draft, disabled = false }: { draft: ReturnType<typeof usePurchaseAttachmentDraft>; disabled?: boolean }) {
  return <div className="space-y-2"><label className="block space-y-2">ملفات الفاتورة<Input type="file" multiple accept={INVOICE_ATTACHMENT_ACCEPT} disabled={disabled || draft.pending} onChange={event => draft.setFiles(Array.from(event.target.files ?? []))} /></label>{draft.error && <p role="alert">{draft.error}</p>}</div>
}

export function ExactPurchaseAttachments({ groupId, attachments, reload }: { groupId: string; attachments: InventoryInvoiceAttachment[]; reload(): Promise<unknown> }) {
  const { t } = useTranslation()
  const draft = usePurchaseAttachmentDraft()
  const [downloadError, setDownloadError] = useState<string | null>(null)
  async function download(file: InventoryInvoiceAttachment) {
    setDownloadError(null)
    try { await downloadDesktopApiFile(resolveApiUrl(`/api/inventory/attachments/${file.id}`), file.originalName) }
    catch (cause) { setDownloadError(cause instanceof Error ? cause.message : t("exactCommerce.commandError")) }
  }
  return <section className="space-y-3 border-t border-border pt-4"><h3>ملفات الفاتورة</h3>
    {attachments.map(file => isDesktopRuntime() ? <Button key={file.id} variant="outline" onClick={() => void download(file)}>{file.originalName}</Button> : <a key={file.id} className="block underline" href={resolveApiUrl(`/api/inventory/attachments/${file.id}`)} target="_blank" rel="noreferrer">{file.originalName}</a>)}
    {downloadError && <p role="alert">{downloadError}</p>}
    <PurchaseAttachmentFiles draft={draft} />
    <Button disabled={draft.pending || !draft.files.length || !draft.valid} onClick={() => void draft.upload(groupId).then(async () => { await reload(); draft.setFiles([]) }).catch(() => {})}>{draft.error ? t("inventory.invoiceCreate.retryAttachments") : t("common.save")}</Button>
  </section>
}
