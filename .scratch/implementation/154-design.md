# M5.4 — Download Progress Indicator

**Issue:** #154  
**Status:** Draft  
**Date:** 2026-07-22

## Public API

### Tauri Commands (lib.rs)

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `start_update_download` | `url: String` | `String` (file path) | Download update file with progress events. Emits `download-progress` events. Supports cancellation. |
| `cancel_update_download` | none | `()` | Sets the cancellation flag. |

### Tauri Events

| Event | Payload | Description |
|-------|---------|-------------|
| `download-progress` | `{ downloadedBytes, totalBytes, speedBytesPerSec, status, error? }` | Emitted during download. Status values: `downloading`, `completed`, `cancelled`, `error`. |

### Frontend

| File | Exports | Description |
|------|---------|-------------|
| `features/update/update-section.tsx` | `UpdateSection` component | Settings section with check/download/apply UI |
| `features/update/update-section.test.tsx` | Tests | Tests for all states |
| `features/update/use-update-mutation.ts` | `useUpdateCheckMutation`, `useUpdateDownload` | Hooks for check/download/apply |

## Internal Dependencies

- `@tauri-apps/api/event` — `listen` for download progress
- `@tauri-apps/api/core` — `invoke` for Tauri commands
- Existing desktop check/apply commands already registered in lib.rs

## States

```
Idle → Checking → Available/NotAvailable
Available → Downloading (progress events) → Completed → Applying
Downloading → Cancelled (via cancel button)
Downloading → Error → Idle (retry)
```

## Planned Tests

- `update-section.test.tsx`:
  - Renders idle state with "Check for Updates" button
  - Shows progress bar during download
  - Shows "Apply Update" on completion
  - Shows error + retry on error
  - Speed calculation from progress events
  - Cancel button during download
- Tauri command tests (integration, manual in Tauri runtime)

## Risks

- Downloading files for real in test mode — use mock Tauri invoke
- Tauri events not available in browser preview — components must gracefully fall back
- File path resolution for downloaded file — use temp directory
