# Update & Release Architecture — Product Requirements Document (PRD)

**PRD ID:** PRD-UPD-001
**Status:** Approved
**Architecture:** `docs/update-architecture.md`
**ADRs:** ADR-LIC-001, ADR-RCA-001
**Date:** 2026-06-30
**References:** ADR-LIC-001, ADR-RCA-001

---

## 1. Overview

### 1.1 Purpose
Define the build pipeline, release pipeline, update architecture, database migration strategy, rollback, and recovery for the Tuari application. The update system must work fully offline, support portable mode, and preserve user data across updates.

### 1.2 Scope
- Build pipeline (CI + signing)
- Release pipeline (channels, publishing)
- Versioning strategy (semver)
- Update architecture (online + offline)
- Portable updates
- Database migrations during updates
- Rollback and recovery
- Update security
- Update UX

### 1.3 Out of Scope
- Licensing (handled by Licensing Architecture)
- Feature flags (handled by Licensing Architecture)
- Cloud deployment of the Business Authority (Year 2+)

---

## 2. Features

### F1: Update Package Format & Signing
**Priority:** P0

**Description:** Define the `.update` package format with Ed25519 signing.

**Acceptance Criteria:**
- [ ] The update package is a `.zip` archive containing `manifest.json`, new frontend build, new sidecar binary, new `node.exe`, and `migrations.json`.
- [ ] The `manifest.json` is signed with the update Ed25519 signing key.
- [ ] The manifest lists every file in the package with its SHA-256 hash.
- [ ] The Trust Authority (`update.rs`) verifies the manifest signature and each file's SHA-256 before extraction.
- [ ] A package with a missing, invalid, or mismatched signature is rejected.
- [ ] A package with a `minSupportedVersion` higher than the current version is rejected.

### F2: Online Update Check & Download
**Priority:** P0

**Description:** Users can check for updates and download them from within the application.

**Acceptance Criteria:**
- [ ] A "Check for Updates" button exists in Settings → About.
- [ ] The Business Authority fetches `updates.json` from a configurable update server URL.
- [ ] If the server is reachable, the latest version info is displayed.
- [ ] If the server is unreachable (offline), a cached response from the last successful check is displayed.
- [ ] If an update is available, a "Download" button starts the download.
- [ ] Download progress (percentage + speed) is displayed to the user.
- [ ] The download can be cancelled.
- [ ] After download, the update package is automatically verified (F1).
- [ ] Download supports resuming interrupted downloads (v2).

### F3: Offline Update via File
**Priority:** P0

**Description:** Users can apply an update by selecting a `.update` file from their filesystem.

**Acceptance Criteria:**
- [ ] An "Install from File" button exists in Settings → About.
- [ ] A native file picker opens for `.update` files.
- [ ] The selected file undergoes the same verification as an online download (F1).
- [ ] After verification, the same apply flow runs.

### F4: Update Application
**Priority:** P0

**Description:** The verified update package is applied atomically.

**Acceptance Criteria:**
- [ ] The current installation is backed up before replacement.
- [ ] The database is backed up before migration.
- [ ] The update package is extracted to a staging directory.
- [ ] Files are replaced atomically (rename pattern).
- [ ] On Windows, a stub updater handles locked `Tuari.exe`.
- [ ] The sidecar is restarted with the new binary.
- [ ] The new sidecar runs pending database migrations before accepting requests.
- [ ] A smoke test verifies the sidecar starts and the database is readable.
- [ ] If the smoke test fails, automatic rollback is triggered.

### F5: Database Migrations
**Priority:** P0

**Description:** Database schema changes are applied during updates.

**Acceptance Criteria:**
- [ ] The update package contains a `migrations.json` manifest.
- [ ] Migrations are run by the new sidecar before it accepts API requests.
- [ ] Each migration has a unique key matching the `app_schema_state` pattern.
- [ ] MINOR and PATCH migrations are strictly additive (ADD COLUMN, CREATE TABLE).
- [ ] The database is backed up (`tuari.sqlite.pre-update`) before migration.
- [ ] A migration failure triggers automatic rollback and database restore.
- [ ] Migrations are idempotent (can be retried).

### F6: Rollback
**Priority:** P1

**Description:** Failed updates are automatically rolled back. Manual rollback is available.

**Acceptance Criteria:**
- [ ] Automatic rollback occurs on: verification failure (before any file change), sidecar startup failure, database migration failure.
- [ ] The previous application version is backed up before update.
- [ ] Rollback restores the previous version's files.
- [ ] For MINOR/PATCH updates, the database is compatible with the old version (no migration revert needed).
- [ ] For MAJOR updates, rollback restores the database from pre-update backup.
- [ ] Manual rollback is available in Settings → Advanced (if backup exists).
- [ ] Rollback via `--recover` flag is available if the app cannot start.

### F7: Portable Mode Updates
**Priority:** P1

**Description:** Portable installations can be updated.

**Acceptance Criteria:**
- [ ] Portable updates use atomic folder replacement (staging → rename).
- [ ] The `data/` directory is never touched during updates.
- [ ] The stub updater handles locked `Tuari.exe` in portable mode.
- [ ] A `.bak` folder is created for rollback support.

### F8: Release Pipeline
**Priority:** P1

**Description:** The release pipeline produces signed artifacts for multiple channels.

**Acceptance Criteria:**
- [ ] CI produces dev-signed artifacts for testing.
- [ ] A separate, gated, offline signing step produces production-signed artifacts.
- [ ] Release channels: nightly (per-commit), beta (weekly), stable (monthly).
- [ ] Each release produces: installer, portable zip, update package, and update metadata.
- [ ] Release notes are published to GitHub Releases.
- [ ] A git tag is created for each release.

### F9: Versioning
**Priority:** P1

**Description:** The application follows semantic versioning.

**Acceptance Criteria:**
- [ ] Version format: `MAJOR.MINOR.PATCH`.
- [ ] The version is defined in `tauri.conf.json` and propagated to all components.
- [ ] The version is displayed in Settings → About.
- [ ] The version is included in the update package manifest.
- [ ] `minSupportedVersion` prevents upgrades from very old installations without stepping through intermediate versions.

### F10: Recovery Mode (`--recover`)
**Priority:** P2

**Description:** If the application cannot start after an update, the user can recover via the command line.

**Acceptance Criteria:**
- [ ] `Tuari.exe --recover` shows a text-based recovery menu.
- [ ] Recovery mode does NOT start the sidecar or WebView.
- [ ] Options: rollback, restore database, safe mode, system info.
- [ ] On Windows, a console window is allocated for the recovery UI.

---

## 3. Architecture Requirements

### R1: Update Verification
- [ ] All update package verification MUST execute in the Trust Authority (Rust Core).
- [ ] The Business Authority (Hono) MUST NOT perform cryptographic verification.
- [ ] The update signing key MUST be separate from the license signing key (both under the same Root CA).

### R2: Data Preservation
- [ ] The database MUST be backed up before any migration runs.
- [ ] MINOR and PATCH migrations MUST be additive only.
- [ ] The `data/` directory MUST NOT be touched during portable updates.

### R3: Atomicity
- [ ] Update application MUST use a staging directory + atomic rename pattern.
- [ ] A locked file handler (stub updater) MUST be used for `Tuari.exe` on Windows.

### R4: Rollback
- [ ] The previous installation MUST be backed up before update.
- [ ] Automatic rollback MUST trigger on: verification failure, sidecar startup failure, migration failure.
- [ ] Rollback MUST be possible from `--recover` mode.

### R5: Offline Support
- [ ] The app MUST NOT phone home for updates automatically.
- [ ] Offline updates via file picker MUST use the same verification as online updates.

---

## 4. User Stories

- **US-001:** As a user, I want to check for and install updates from within the application so that I stay up-to-date.
- **US-002:** As a user on an offline machine, I want to apply an update by transferring a file from another device.
- **US-003:** As a user, I want my data to be preserved across updates.
- **US-004:** As a user, if an update fails, I want the application to automatically restore the previous version.
- **US-005:** As a user, I want to know my current version and update history.

---

## 5. Non-Functional Requirements

| NFR | Requirement |
|-----|-------------|
| NFR-1 | Update package for PATCH releases must be no larger than 5 MB (only changed files). For MINOR/MAJOR, full package may be up to 50 MB. |
| NFR-2 | Update verification (signature + hash check) must complete within 2 seconds on modern hardware. |
| NFR-3 | The update system must not increase the base application startup time (verification is deferred until the user triggers an update check). |
| NFR-4 | Rollback must complete within 10 seconds. |
| NFR-5 | The `--recover` mode must start within 1 second. |

---

## 6. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| `crypto.rs` (shared Ed25519/SHA-256 utilities) | Internal | Created by Phase 1, shared with licensing |
| `update.rs` (update verification) | Internal | New Rust Core module |
| `scripts/sign-update.mjs` (CLI tool) | Internal | New, no Rust dependency |
| Stub updater binary (`tuari-updater.exe`) | Internal | Small Rust binary, minimal dependencies |
| Update server (CDN + updates.json) | External | Static file hosting. Can be GitHub Releases initially. |

---

## 7. Release Criteria

- [ ] F1, F2, F3, F4, F5 (P0 features) are implemented and tested.
- [ ] F6, F7, F8, F9 (P1 features) are implemented and tested.
- [ ] F10 (P2) is implemented or documented as deferred.
- [ ] Unit tests exist for:
  - [ ] Signature verification (positive + negative)
  - [ ] SHA-256 file hash verification
  - [ ] `minSupportedVersion` check
  - [ ] Migration manifest parsing
- [ ] Integration tests exist for:
  - [ ] End-to-end update cycle (build → sign → verify → apply)
  - [ ] Database migration on test SQLite file
  - [ ] Automatic rollback on migration failure
- [ ] E2E tests exist for:
  - [ ] Online update flow (mock server)
  - [ ] Offline update flow (file picker)
- [ ] The production update signing key has been generated and secured on the air-gapped HSM.
- [ ] The dev update signing key is committed and used by CI.
- [ ] This document is reviewed and approved by the architecture team.
