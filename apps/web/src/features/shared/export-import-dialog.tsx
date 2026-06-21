import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/form-controls";

type ExportFormat = "CSV" | "JSON" | "EXCEL";
type ImportStatus = "idle" | "uploading" | "validating" | "importing" | "success" | "error";

interface ExportImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onExport: (format: ExportFormat) => void;
  onImport: (file: File, format: ExportFormat) => Promise<void>;
}

export function ExportImportDialog({
  isOpen,
  onOpenChange,
  title,
  onExport,
  onImport,
}: ExportImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("CSV");
  const [importFormat, setImportFormat] = useState<ExportFormat>("CSV");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Manage success and error timeouts with cleanup
  useEffect(() => {
    if (importStatus === "success") {
      timeoutRef.current = setTimeout(() => {
        onOpenChange(false);
        setSelectedFile(null);
        setImportStatus("idle");
      }, 2000);
    } else if (importStatus === "error") {
      timeoutRef.current = setTimeout(() => {
        setImportStatus("idle");
      }, 3000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [importStatus, onOpenChange]);

  const handleExport = () => {
    onExport(exportFormat);
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setErrorMessage("الرجاء اختيار ملف للاستيراد");
      return;
    }

    try {
      setImportStatus("uploading");
      setErrorMessage("");
      await onImport(selectedFile, importFormat);
      setImportStatus("success");
    } catch (error) {
      setImportStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "خطأ في الاستيراد");
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-4 z-50 flex flex-col rounded-lg border border-border/60 bg-background md:inset-auto md:h-auto md:w-full md:max-w-md md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
        {/* Header */}
        <div className="border-b border-border/60 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/60">
          <button
            onClick={() => setActiveTab("export")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition ${
              activeTab === "export"
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground"
            }`}
          >
            تصدير
          </button>
          <button
            onClick={() => setActiveTab("import")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition ${
              activeTab === "import"
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground"
            }`}
          >
            استيراد
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {activeTab === "export" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">صيغة التصدير</label>
                <NativeSelect value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)}>
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="EXCEL">Excel</option>
                </NativeSelect>
              </div>

              <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                <p className="font-medium mb-2">ملاحظات:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>سيتم تصدير جميع البيانات المرئية</li>
                  <li>تحقق من البيانات قبل المشاركة</li>
                  <li>الملف قابل للاستيراد في النظام</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">صيغة الاستيراد</label>
                <NativeSelect value={importFormat} onChange={(e) => setImportFormat(e.target.value as ExportFormat)}>
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="EXCEL">Excel</option>
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">اختر الملف</label>
                <Input
                  type="file"
                  accept={importFormat === "CSV" ? ".csv" : importFormat === "JSON" ? ".json" : ".xlsx"}
                  onChange={(e) => {
                    setSelectedFile(e.target.files?.[0] || null);
                    setErrorMessage("");
                  }}
                />
              </div>

              {selectedFile && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  ✓ تم تحديد: {selectedFile.name}
                </div>
              )}

              {importStatus === "success" && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  ✓ تم الاستيراد بنجاح!
                </div>
              )}

              {errorMessage && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  ✕ {errorMessage}
                </div>
              )}

              {importStatus === "uploading" || importStatus === "validating" || importStatus === "importing" ? (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                  جاري {
                    importStatus === "uploading" ? "رفع" :
                    importStatus === "validating" ? "التحقق" :
                    "استيراد"
                  } الملف...
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 px-4 py-3 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={activeTab === "export" ? handleExport : handleImport}
            disabled={activeTab === "import" && (!selectedFile || importStatus !== "idle")}
          >
            {activeTab === "export" ? "تصدير" : "استيراد"}
          </Button>
        </div>
      </div>
    </>
  );
}
