import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWorkspaceScopedQuery } from "@/features/app-shell/workspace-queries"
import { desktopApiFetch, downloadDesktopApiFile } from "@/lib/desktop-api-bridge"
import { isDesktopRuntime } from "@/lib/desktop-auth-session"
import { createRpcHeaders, resolveRpcCredentials } from "@/lib/orpc-client"
import { resolveApiUrl } from "@/lib/runtime-config"
import { INVOICE_ATTACHMENT_ACCEPT, validateInvoiceAttachmentFiles } from "../inventory/invoice-attachment-rules"

type Receipt = { id: string; originalName: string; byteSize: number }

export function ExpenseAttachments({ expenseId, readOnly = false }: { expenseId: string; readOnly?: boolean }) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const path = `/api/expenses/${encodeURIComponent(expenseId)}/attachments`
  async function request(method: string, batch?: File[]) {
    const url = resolveApiUrl(path)
    const form = new FormData()
    for (const file of batch ?? []) form.append("files", file)
    const response = isDesktopRuntime() ? await desktopApiFetch(url, {
      authenticated: true, method,
      ...(batch ? { multipartFiles: await Promise.all(batch.map(async file => ({ fieldName: "files", fileName: file.name, mimeType: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) }))) } : {}),
    }) : await fetch(url, { method, credentials: resolveRpcCredentials(), headers: createRpcHeaders(), ...(batch ? { body: form } : {}) })
    if (!response.ok) throw new Error("Expense attachment request failed")
    return await response.json() as { items: Receipt[] }
  }
  const query = useWorkspaceScopedQuery({ key: user => ["expense-files", user, expenseId], queryFn: () => request("GET"), refetchOnMount: "always" })
  const validation = validateInvoiceAttachmentFiles(files, {
    tooMany: max => t("inventory.invoiceCreate.attachmentTooMany", { max }),
    tooLarge: (fileName,maxMb) => t("inventory.invoiceCreate.attachmentTooLarge", {fileName,maxMb}),
    totalTooLarge: maxMb => t("inventory.invoiceCreate.attachmentTotalTooLarge",{maxMb}),
    unsupportedType: fileName => t("inventory.invoiceCreate.attachmentUnsupportedType",{fileName}),
  })
  async function upload() {
    if (readOnly || busy.current || validation || !files.length) return
    busy.current = true; setPending(true); setError(false)
    try {
      await request("POST", files)
      setFiles([]); setVersion(v=>v+1)
      await query.refetch({throwOnError:true})
    } catch { setError(true) }
    finally { busy.current = false; setPending(false) }
  }
  return <section className="space-y-3 border-t border-border pt-4" aria-label={t("inventory.transfer.attachments")}>
    <h3 className="text-sm font-medium">{t("inventory.transfer.attachments")}</h3>
    {query.isPending ? <p role="status">{t("exactCommerce.loadingInvoiceDetails")}</p> : query.isError ? <Button variant="outline" onClick={()=>void query.refetch()}>{t("common.retry")}</Button> : query.data?.items.map(file => isDesktopRuntime() ? <Button key={file.id} variant="outline" onClick={()=>void downloadDesktopApiFile(resolveApiUrl(`${path}/${file.id}`),file.originalName).catch(()=>setError(true))}>{file.originalName}</Button> : <a key={file.id} className="block underline" target="_blank" rel="noreferrer" href={resolveApiUrl(`${path}/${file.id}`)}>{file.originalName}</a>)}
    {!readOnly && <>
      <Input key={version} aria-label={t("inventory.transfer.attachments")} type="file" multiple accept={INVOICE_ATTACHMENT_ACCEPT} disabled={pending || query.isError} onChange={event=>setFiles(Array.from(event.target.files ?? []))} />
      <Button disabled={pending || !!validation || !files.length || query.isError} onClick={()=>void upload()}>{t("common.save")}</Button>
    </>}
    {(validation || error) && <p role="alert">{validation ?? t("inventory.invoiceCreate.attachmentsUploadFailed")}</p>}
  </section>
}
