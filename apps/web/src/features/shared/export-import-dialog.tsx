/**
 * Export/Import dialog for data migration.
 */
import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/form-controls"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

type ExportFormat = "CSV" | "JSON" | "EXCEL"
type ImportStatus = "idle" | "uploading" | "validating" | "importing" | "success" | "error"

interface ExportImportDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onExport: (format: ExportFormat) => void
  onImport: (file: File, format: ExportFormat) => Promise<void>
}

/**
 * @description Component
 */
export function ExportImportDialog({
  isOpen,
  onOpenChange,
  title,
  onExport,
  onImport,
}: ExportImportDialogProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<"export" | "import">("export")
  const [exportFormat, setExportFormat] = useState<ExportFormat>("CSV")
  const [importFormat, setImportFormat] = useState<ExportFormat>("CSV")
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Manage success and error timeouts with cleanup
  useEffect(() => {
    if (importStatus === "success") {
      timeoutRef.current = setTimeout(() => {
        onOpenChange(false)
        setSelectedFile(null)
        setImportStatus("idle")
      }, 2000)
    } else if (importStatus === "error") {
      timeoutRef.current = setTimeout(() => {
        setImportStatus("idle")
      }, 3000)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [importStatus, onOpenChange])

  const handleExport = () => {
    onExport(exportFormat)
    onOpenChange(false)
  }

  const handleImport = async () => {
    if (!selectedFile) {
      setErrorMessage(t("exportImport.selectFileError"))
      return
    }

    try {
      setImportStatus("uploading")
      setErrorMessage("")
      await onImport(selectedFile, importFormat)
      setImportStatus("success")
    } catch (error) {
      setImportStatus("error")
      setErrorMessage(error instanceof Error ? error.message : t("exportImport.importError"))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "export" | "import")}>
          <TabsList className="w-full">
            <TabsTrigger value="export" className="flex-1">
              {t("exportImport.export")}
            </TabsTrigger>
            <TabsTrigger value="import" className="flex-1">
              {t("exportImport.import")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("exportImport.exportFormat")}
              </label>
              <NativeSelect
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              >
                <option value="CSV">CSV</option>
                <option value="JSON">JSON</option>
                <option value="EXCEL">Excel</option>
              </NativeSelect>
            </div>

            <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
              <p className="font-medium mb-2">{t("exportImport.notes")}:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>{t("exportImport.allVisibleData")}</li>
                <li>{t("exportImport.checkDataBeforeSharing")}</li>
                <li>{t("exportImport.fileImportable")}</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="import" className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("exportImport.importFormat")}
              </label>
              <NativeSelect
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as ExportFormat)}
              >
                <option value="CSV">CSV</option>
                <option value="JSON">JSON</option>
                <option value="EXCEL">Excel</option>
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("exportImport.chooseFile")}
              </label>
              <Input
                type="file"
                accept={importFormat === "CSV" ? ".csv" : importFormat === "JSON" ? ".json" : ".xlsx"}
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] || null)
                  setErrorMessage("")
                }}
              />
            </div>

            {selectedFile && (
              <div className="rounded-lg bg-good-soft p-3 text-sm text-good">
                ✓ {t("exportImport.selected")}: {selectedFile.name}
              </div>
            )}

            {importStatus === "success" && (
              <div className="rounded-lg bg-good-soft p-3 text-sm text-good">
                ✓ {t("exportImport.importSuccess")}
              </div>
            )}

            {errorMessage && (
              <div className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
                ✕ {errorMessage}
              </div>
            )}

            {(importStatus === "uploading" || importStatus === "validating" || importStatus === "importing") && (
              <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                {t("exportImport.importing")}...
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={activeTab === "export" ? handleExport : handleImport}
            disabled={activeTab === "import" && (!selectedFile || importStatus !== "idle")}
          >
            {activeTab === "export" ? t("exportImport.export") : t("exportImport.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
