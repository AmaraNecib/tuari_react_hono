# Native diagnostic snapshot

Base 3e79ae5b. Mode focused-local / CI-final-pending. High assurance, local diagnostic disclosure risk. No publication.

The native command record_ui_failure accepts id:u32 matching the web invocation. Numeric IDs are included in duplicate signatures, so separate failure codes retain separate persisted records. The UI prefix remains a shared web constant.

Recent diagnostics use a bounded 100-event process-local ring, populated only with typed timestamps, fixed severity/category vocabulary and numeric IDs. Snapshot reads no persisted log text or arbitrary paths. This deliberately shows events since process startup, not historical day folders. Raw messages, errors and payloads never enter the snapshot. Native writes are synchronous, so pending buffered count is zero. Dropped count tracks actual emission errors, not the degraded boolean. Persistence remains the existing event sink.

Focused regression covers 105 distinct IDs at one timestamp, the 100-event cap, exact first/last IDs, normalized timestamp and redaction. Original panic, concurrent write and retention tests remain intact. Expected-red missing snapshot method was preserved. An intermediate accidental test-section removal was caught because execution reported zero tests, restored before final proof, and never committed. No zero-test pass is claimed.

ZIP export is not implemented. It requires a separately approved archive approach. No dependencies added. No API/reporting/#326 work. Browser integration, independent review and owner signoff remain pending. Existing generated schema line-ending-only changes are excluded from source commit. Applied PowerShell-by-file safety and bounded affected proof.
