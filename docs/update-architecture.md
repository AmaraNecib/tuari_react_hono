# Update & Release Architecture — Final Canonical Design

**Author:** Lead Software Architect
**Date:** 2026-06-30
**Status:** Approved
**Priority:** P0 — Required before first customer ships
**References:** ADR-LIC-001, ADR-RCA-001

---

## Table of Contents

1. Terminology
2. Architectural Principles
3. Trust Authority Responsibilities
4. Business Authority Responsibilities
5. Updater Engine Responsibilities
6. Tauri Adapter Responsibilities
7. Presentation Authority Responsibilities
8. Build Pipeline (Architecture-Level)
9. Release Pipeline (Architecture-Level)
10. Versioning Strategy
11. Release Channels
    11.1 Channel Metadata (`updates.json`)
    11.2 Channel Promotion
12. Artifact Responsibilities
13. Update Architecture
14. Update Package Format
15. Update Provider Abstraction
16. Update Strategy Abstraction
17. Portable Updates
18. Database Migrations During Updates
19. Rollback Strategy
20. Recovery Environment
21. Edition Upgrades During Updates
22. Deployment Modes
23. Update Security
24. Update UX
25. Long-Term Evolution
26. Implementation Strategy
27. Future ADRs

---

## 1. Terminology

| Term | Definition |
|------|------------|
| **Build** | A CI run that produces artifacts. |
| **Release** | A build that has been signed, tested, and published to a release channel. |
| **Artifact** | A deliverable file: installer, portable zip, update package. |
| **Update Package** | A signed archive delivered to an existing installation to upgrade it. |
| **Update Package Format** | The defined structure and version of an update package. |
| **Release Channel** | A named distribution stream (stable, beta, nightly). |
| **Rollback** | Restoring the previous application version while preserving user data. |
| **Recovery Environment** | A minimal operating mode that allows repair after a failed update. |
| **Updater Engine** | The component responsible for orchestrating download, verification, staging, apply, rollback, and smoke tests. |
| **Update Provider** | The source from which update packages are obtained (CDN, LAN server, local file). |
| **Update Strategy** | The mechanism for delivering changes (full package, differential, chunked). |
| **Trust Authority** | Rust Core — verifies update package signatures. |
| **Business Authority** | Hono — serves update metadata, runs database migrations. |
| **Tauri Adapter** | Desktop bindings — bridges Tauri IPC to the Updater Engine. |
| **Presentation Authority** | React — displays update status and prompts to the user. |

---

## 2. Architectural Principles

### U1. Updates Are Signed by the Trust Authority
Every update package must carry a verifiable signature. The Trust Authority (Rust Core) must verify the signature before any files are extracted or replaced. The Business Authority must never perform cryptographic verification of update packages.

### U2. User Data Is Never Lost
Data present before the update is never destroyed by the update or rollback process. Database migrations in MINOR and PATCH versions must be additive only. Rollback must restore the previous application version and a pre-update database backup. The database must be backed up before any migration runs. Data created by new features after an update may become inaccessible if the user rolls back — this is documented in the release notes.

### U3. Offline Updates Are First-Class
Users must be able to apply updates without internet connectivity. The same signature verification must apply regardless of how the update package was obtained.

### U4. Every Update Is Atomic
An update must either complete fully or leave the system in its previous working state. Partial updates must be impossible by design.

### U5. Updates Respect Licensing
The update system must not modify or check licenses. License files must persist across updates. Edition upgrades are orthogonal to software updates.

### U6. The Update Strategy Is Abstracted
The architecture must not assume a single update delivery mechanism. Full packages, differential updates, chunked streaming, and future strategies must be supported through a common abstraction.

### U7. The Update Provider Is Abstracted
The architecture must not assume a single update source. CDN, LAN server, enterprise update server, and local files must be supported through a common abstraction.

---

## 3. Trust Authority Responsibilities (Rust Core)

The Trust Authority owns all cryptographic operations related to updates.

| Responsibility | Description |
|---------------|-------------|
| **Verify update package signature** | Ed25519 signature verification of the update manifest |
| **Verify file integrity** | SHA-256 verification of each file against the manifest |
| **Verify version compatibility** | Check that the current version meets `minSupportedVersion` |
| **Maintain trusted keys** | Embedded update public key + key rotation certificates |
| **Provide shared crypto utilities** | Ed25519 + SHA-256 functions shared with licensing (`crypto.rs`) |

**Key relationship:** The update signing key is a separate subkey under the same Root CA as the license signing key. The Rust Core embeds two distinct public keys and distinguishes them by context.

The manifest signature is computed over a canonical representation of the manifest JSON (excluding the signature field itself). The exact canonical serialization algorithm is defined in ADR-UPD-003.

---

## 4. Business Authority Responsibilities (Hono)

The Business Authority owns update metadata delivery and database migration execution.

| Responsibility | Description |
|---------------|-------------|
| **Serve update metadata** | Return latest version info when the user checks for updates |
| **Run database migrations** | Execute pending migrations from the migration manifest before accepting API requests |
| **Report current version** | Include version info in the session response |
| **Record update history** | Log applied updates in the `update_history` table. Update history is application data owned by the Business Authority. |

---

## 5. Updater Engine Responsibilities

The **Updater Engine** is the central orchestrator for the update lifecycle. It is a platform component (currently lives in the same Rust binary as the Tauri Adapter and Trust Authority, but architecturally distinct). It depends on the Trust Authority for verification and on the Tauri Adapter for platform-specific operations.

| Responsibility | Description |
|---------------|-------------|
| **Coordinate update lifecycle** | Orchestrate the sequence: verify → backup → stage → apply → smoke test → cleanup or rollback |
| **Download update package** | Via the Update Provider (online) |
| **Accept update package file** | Via the Update Provider (offline — user provides the file) |
| **Verify package via Trust Authority** | Call `update::verify()` |
| **Back up current installation** | Create a recoverable copy of current binaries |
| **Back up database** | Copy the SQLite file before migration |
| **Stage the update** | Extract the package to a staging directory |
| **Apply the update** | Atomic replacement of production files with staged files |
| **Run smoke tests** | Verify the update has not degraded core application functionality. The exact smoke test scope is defined in ADR-UPD-006. |
| **Trigger rollback** | On failure: restore previous version and database |
| **Handle restart** | Restart the sidecar or full application as needed |
| **Expose progress** | Report progress to the Presentation Authority via Tauri Adapter |

---

## 6. Tauri Adapter Responsibilities

The Tauri Adapter is a thin bridge between the Tauri desktop environment and the Updater Engine. It must not contain update orchestration logic.

| Responsibility | Description |
|---------------|-------------|
| **Register Tauri commands** | Expose Updater Engine operations to the frontend via IPC |
| **Handle platform-specific locking** | Delegate locked-file replacement to a platform-appropriate mechanism |
| **Provide platform integration** | File dialogs for offline update, process restart, sidecar lifecycle |

---

## 7. Presentation Authority Responsibilities (React)

| Responsibility | Component |
|---------------|-----------|
| **"Check for Updates" button** | Settings → About |
| **Update notification badge** | App shell header (shown only when update is staged) |
| **Download progress indicator** | Modal dialog with percentage |
| **"Restart to apply" prompt** | Modal dialog |
| **Offline update file picker** | File upload dialog |
| **Update history display** | Settings → About |
| **Current version display** | Settings → About |

---

## 8. Build Pipeline (Architecture-Level)

The architecture defines only the trust and integrity properties of the build pipeline. The concrete CI workflow belongs in Release Engineering documentation.

| Property | Requirement |
|----------|-------------|
| **Trust chain** | CI builds are signed with a development key. Release builds are signed with a production key (air-gapped). |
| **Signing authority** | Only authorized humans can trigger production signing. The signing environment is air-gapped or HSM-backed. |
| **Verification boundary** | The Rust Core trusts both dev and production public keys. Dev key is disabled in production builds via compile-time configuration. |
| **Artifact provenance** | Every artifact must be traceable to a specific commit via its build number and git tag. |
| **Algorithm consistency** | The signing tool and the verification function MUST implement the same signature and canonicalization algorithm. They MUST be tested against each other to confirm compatibility. |

---

## 9. Release Pipeline (Architecture-Level)

| Property | Requirement |
|----------|-------------|
| **Artifact signing** | All production artifacts must be signed before publication. |
| **Release channels** | At least three: nightly (internal), beta (testers), stable (customers). |
| **Channel promotion** | Each release channel uses a dedicated signing key. Promoting an artifact between channels requires re-signing with the target channel's key (see ADR-UPD-004). |
| **Release artifacts** | Each release produces: installer, portable package, update package, update metadata, change log. |

---

## 10. Versioning Strategy

Format: `MAJOR.MINOR.PATCH`

| Component | When to Bump |
|-----------|-------------|
| **MAJOR** | Breaking schema changes, breaking API changes, significant architectural changes |
| **MINOR** | New features, new additive database tables/columns, new API endpoints |
| **PATCH** | Bug fixes, performance improvements, security patches — no schema changes |

### Version Compatibility

| Upgrade Path | Supported? |
|-------------|-----------|
| PATCH → PATCH (same MINOR) | ✅ Yes. No schema changes. |
| MINOR → MINOR (same MAJOR) | ✅ Yes. Additive schema changes only. |
| N-2 → N (skip one MINOR) | ✅ Yes. All migrations run in sequence. |
| N-3 → N (skip two+) | ⚠️ Step through N-1 first. |
| MAJOR → MAJOR | ⚠️ Explicitly documented per release. |
| Any downgrade | ⚠️ Supported only via rollback (backup restore). |

---

## 11. Release Channels

| Channel | Audience | Signing Key |
|---------|----------|-------------|
| **nightly** | Internal developers | Dev key |
| **beta** | Beta testers | Signing key policy defined in ADR-UPD-004 |
| **stable** | All customers | Production key |

### 11.1 Channel Metadata (`updates.json`)

Each channel publishes an `updates.json` file that tells clients what version is available and where to download it. The file is generated by `scripts/update-channel-metadata.mjs` and has the following structure:

```json
{
  "channels": {
    "nightly": {
      "latestVersion": "0.6.0-nightly.20260708",
      "minSupportedVersion": "0.1.0",
      "updateUrl": "https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.6.0-nightly.update",
      "releaseDate": "2026-07-08T00:00:00Z",
      "changeLog": "https://github.com/AmaraNecib/tuari_react_hono/releases/nightly"
    }
  }
}
```

The Business Authority (Hono) serves this file so clients can check which channel they are on and what updates are available.

### 11.2 Channel Promotion

A build can be promoted from one channel to the next (nightly → beta → stable) without re-signing:

1. **Nightly → Beta:** The same `.update` package is uploaded to the beta release. A new `updates.json` is generated pointing to the beta download URL (either from scratch or using `--merge` on the existing file).
2. **Beta → Stable:** The same `.update` package is uploaded to the stable/latest release. A new `updates.json` is generated pointing to the stable download URL.

**Why no re-signing is required:** The update package signature is verified against a set of trusted public keys embedded in the Trust Authority. All channel keys are included in the trusted set, so a package signed by any channel key can be verified regardless of which channel it is served from. The signature is computed over the manifest content (version, file hashes, etc.), not over the distribution URL. Changing the distribution channel does not alter the manifest content, so the original signature remains valid.

**What changes during promotion:** Only the `updates.json` metadata — specifically the `updateUrl` field changes to point to the target channel's download URL. The `.update` package binary is identical across channels.

**Promotion workflow:**
```bash
# Promote nightly → beta: merge beta entry into existing updates.json
node scripts/update-channel-metadata.mjs \
  --channel beta \
  --version "0.6.0-nightly.20260708" \
  --min-version "0.1.0" \
  --url "https://github.com/AmaraNecib/tuari_react_hono/releases/download/beta/update-0.6.0-nightly.update" \
  --release-date "2026-07-08T00:00:00Z" \
  --changelog "https://github.com/AmaraNecib/tuari_react_hono/releases/beta" \
  --merge updates.json \
  --output updates.json

# Promote beta → stable: merge stable entry
# (same command with --channel stable and stable URL)
```

---

## 12. Artifact Responsibilities

| Artifact | Purpose | Signed? |
|----------|---------|---------|
| Installer | New installations and major version upgrades | Platform code signing (mechanism varies by platform — see ADR-UPD-004) + update signature |
| Portable Package | USB-borne installations | Update signature |
| Update Package | In-place upgrades for existing installations | Update signature |
| Update Metadata | Version information served by Update Provider | Update signature |

---

## 13. Update Architecture

### 13.1 Online Update

```
User triggers update check
  → Presentation Authority calls Business Authority endpoint
  → Business Authority queries Update Provider (abstract)
  → Business Authority returns latest version info
  → User initiates download
  → Updater Engine downloads via Update Provider
  → Updater Engine calls Trust Authority: verify(package)
  → If verification fails: abort, do not modify files
  → If verification succeeds: proceed to apply (Section 13.3)
```

### 13.2 Offline Update

```
User selects .update file via file picker
  → Tauri Adapter provides the file path to Updater Engine
  → Updater Engine calls Trust Authority: verify(package)
  → Same apply flow as online
```

### 13.3 Apply Flow

```
Updater Engine orchestrates:
  0. If any pre-apply integrity operation (backup, verification) fails, abort immediately
  1. Back up current installation
  2. Back up database (SQLite file copy)
  3. Extract update package to staging directory
  4. Atomic rename: staging → production
  5. Handle locked files via platform-appropriate mechanism
  6. Restart sidecar
  7. New sidecar runs pending database migrations
  8. Smoke test: health check + schema query
  9. If OK → mark successful, clean up backups
  10. If FAIL → trigger rollback
```

---

## 14. Update Package Format

### 14.1 Format Versioning

The update package format is versioned independently of the application:

| Format Version | Description |
|---------------|-------------|
| **V1** | Full-package archive. Initially `.zip`-based for broad platform compatibility. |
| **V2 (future)** | Differential update support. |
| **V3 (future)** | Chunked streaming support. |

The `manifestVersion` field in the manifest identifies the format version. The Trust Authority rejects packages with an unknown or unsupported manifest version.

### 14.2 V1 Package Structure

Every file contained in the update package MUST appear in the manifest with its SHA-256 hash.

```
manifest.json            # Signed manifest (contains manifestVersion, file list, signatures)
bin/                     # New binaries (node.exe, sidecar, frontend)
  node.exe
  api-runtime/
    dist/index.cjs
    node_modules/
  web/
    dist/
migrations.json          # Database migration manifest
CHANGELOG.md             # Release notes
```

### 14.3 V1 Manifest Format

```json
{
  "manifestVersion": 1,
  "appVersion": "1.3.0",
  "buildNumber": 456,
  "minSupportedVersion": "1.1.0",
  "files": [
    { "path": "bin/api-runtime/dist/index.cjs", "sha256": "abc...", "size": 67890 }
  ],
  "migrations": {
    "supportedFrom": "1.1.0",
    "migrationCount": 2
  },
  "signature": "base64url-of-ed25519-signature"
}
```

---

## 15. Update Provider Abstraction

The Updater Engine obtains update packages through an **Update Provider**. The architecture defines the interface, not the implementation.

```text
Update Provider (interface)
  │
  ├── Remote Provider (online download from URL)
  │     └── Configurable URL (default: releases.tuari.app)
  │
  ├── File Provider (local file provided by user)
  │     └── File picker → Updater Engine
  │
  ├── LAN Provider (network share, for server mode)
  │
  └── Enterprise Provider (private update server)
```

The Business Authority queries the Update Provider for metadata (`updates.json`). The Updater Engine downloads the package through the same provider. If the provider is unreachable, the last-known metadata is cached.

---

## 16. Update Strategy Abstraction

The update package delivery mechanism is abstracted behind an **Update Strategy**:

```text
Update Strategy (interface)
  │
  ├── Full Package (V1 — current)
  │     Whole application is replaced.
  │
  ├── Differential (V2 — future)
  │     Only changed files are shipped. Requires a base version manifest.
  │
  ├── Chunked (V3 — future)
  │     Large packages are downloaded in chunks for resume support.
  │
  └── Streamed (future)
  │     Package is applied incrementally as it downloads.
```

The architecture and Updater Engine are designed to support any strategy. The `manifest.json` format must accommodate partial file lists for differential updates.

---

## 17. Portable Updates

### Principle

Portable updates replace only the application binaries. The `data/` directory (licenses, database, runtime state) is never touched.

Portable updates MUST include startup failure detection capable of restoring the previous version if initialization fails.

### Mechanism

Atomic folder replacement with a backup-and-swap pattern:

1. Extract update to a staging folder.
2. Rename current folder → backup folder (on Windows, handle locked `Tuari.exe` via stub updater).
3. Rename staging folder → current folder.
4. On next successful startup, delete backup folder.
5. On failure, restore from backup.

---

## 18. Database Migrations During Updates

### 18.1 Execution

1. The new sidecar starts after the update is applied.
2. Before accepting API requests, the sidecar reads `migrations.json` from the update package.
3. The sidecar compares migration keys against `app_schema_state`.
4. The sidecar backs up the database (`tuari.sqlite.pre-update`).
5. The sidecar runs pending migrations within a transaction.
6. On success: commit, record each migration key.
7. On failure: roll back transaction, log error, return failure to Updater Engine.
8. Updater Engine on migration failure: restore database from backup, trigger software rollback.

### 18.2 Rules

| Rule | Rationale |
|------|-----------|
| MINOR/PATCH migrations are additive only | Rollback does not require schema revert |
| MAJOR migrations may be destructive but must document what they remove | Breaking changes require explicit user consent |
| Every migration has a unique key | Enables idempotent tracking |
| Database is backed up before migration | Last resort if migration fails irrecoverably |
| If `migrationCount > 0` and `migrations.json` is missing or malformed, the update MUST fail | Silent migration skip would leave schema incompatible with code |
| Unknown migration keys in `app_schema_state` are logged and silently skipped | Handles migration removal from codebase gracefully |

---

## 19. Rollback Strategy

### 19.1 Trigger Conditions

| Condition | Automatic? | Action |
|-----------|-----------|--------|
| Update package verification fails | ✅ Auto | Package rejected, no files modified |
| Sidecar fails to start after update | ✅ Auto | Restore previous version + database |
| Database migration fails | ✅ Auto | Restore database from backup, restore previous version |
| User manually triggers rollback | Manual | Restore from backup (if available) |

### 19.2 Mechanism

1. Previous installation is backed up before update is applied.
2. Database backup exists from pre-migration step.
3. On rollback: restore previous binaries, restore pre-migration database.
4. For additive-only migrations (MINOR/PATCH): the pre-update database is compatible with the old version even if migrations completed (old code ignores unknown columns/tables).
5. Backups MUST be retained for a safety window after a successful update. They may only be removed once sufficient evidence exists that the update is stable. The exact retention policy is defined in ADR-UPD-005.

---

## 20. Recovery Environment

### 20.1 Definition

The **Recovery Environment** is a minimal application mode that allows repair after a failed update. It does not start the sidecar or load the WebView. It uses only the Trust Authority and filesystem access.

### 20.2 Capabilities

| Capability | Description |
|-----------|-------------|
| **Rollback** | Restore the previous application version from backup |
| **Restore database** | Restore `tuari.sqlite` from the pre-update backup |
| **Safe mode** | Start with no migrations, read-only database access |
| **System information** | Display current version, paths, last update status |

### 20.3 Implementation Independence

The architecture defines the Recovery Environment by its capabilities, not by how it is invoked. Concrete implementations may include:

- A command-line flag (`--recover`)
- A dedicated recovery executable
- A platform-specific recovery launcher
- A Windows recovery console entry

---

## 21. Edition Upgrades During Updates

Edition upgrades and software updates are orthogonal:

| Scenario | What Happens |
|----------|-------------|
| User updates software (same edition) | License file persists. No change. |
| User upgrades edition (same software version) | License file replaced. No software update. |
| User updates + upgrades edition | Both happen independently. Order does not matter. |

**Rule:** The update system must never read or write license files. The licensing system must never trigger updates.

---

## 22. Deployment Modes

| Mode | Year | Update Mechanism |
|------|------|-----------------|
| **Desktop** | 1 | User-triggered check, online download or offline file |
| **Internal Server** | 2 | Server-side: standard service update. Client-side: same as desktop. |
| **Cloud** | 4+ | Cloud service: CI/CD pipeline. Desktop client: same as desktop. |

---

## 23. Update Security

### 23.1 Threat Model

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Compromised update server | RCE | Ed25519 signature verification by Trust Authority |
| Man-in-the-middle | RCE | HTTPS + signature verification (defense in depth) |
| User downloads fake update | RCE | Signature verification rejects unsigned packages |
| Rollback to vulnerable version | Re-exposure | `minSupportedVersion` check in manifest |
| Database migration corruption | Data loss | Backup before migration, rollback on failure |
| Local file tampering | RCE | Signature verification on every update package source |

### 23.2 Key Hierarchy

```
Root CA (air-gapped HSM)
  ├── License Signing Subkey
  └── Update Signing Subkey
```

### 23.3 Key Rotation

Same mechanism as licensing key rotation (Licensing Architecture §3.5). Rotation certificates include a `purpose` field to distinguish license vs update keys.

---

## 24. Update UX

| State | UX |
|-------|-----|
| Up-to-date | Settings shows current version with "(latest)" |
| Update available | Badge + "Download" button |
| Downloading | Progress bar |
| Verifying | "جاري التحقق من حزمة التحديث" |
| Ready to install | "تطبيق الآن" / "لاحقاً" |
| Installing | Brief progress |
| Verification failed | "فشل التحقق. يرجى التنزيل يدوياً." |
| Apply failed | "تم استعادة الإصدار السابق." |
| Offline | File picker for `.update` files |

---

## 25. Long-Term Evolution

| Year | Update Capability | Deployment |
|------|------------------|------------|
| 1 | V1 full-package updates, offline support, rollback, portable | Desktop |
| 2 | LAN server updates, beta channel | Internal Server |
| 3 | Differential updates, key rotation, remote admin | Remote Administration |
| 4 | Cloud service updates, canary deployments | Cloud Sync |
| 5 | Hybrid deployment updates, A/B testing | Hybrid |

---

## 26. Implementation Strategy

### 26.1 Module Allocation

| Module | Layer | Description |
|--------|-------|-------------|
| `crypto.rs` | Trust Authority | Shared Ed25519 + SHA-256 utilities |
| `update.rs` | Trust Authority | Package verification, manifest parsing, key management |
| `updater_engine.rs` | Updater Engine | Update lifecycle orchestration (download, stage, apply, rollback, smoke test) |
| `update_provider.rs` | Updater Engine | Abstract provider interface (remote, file, LAN) |
| `update_strategy.rs` | Updater Engine | Abstract strategy interface (full, differential, chunked) |
| `recovery.rs` | Updater Engine | Recovery environment implementation |
| `stub_updater.rs` | Tauri Adapter (separate binary) | Locked-file replacement on Windows |
| `lib.rs` (extend) | Tauri Adapter | IPC commands delegating to Updater Engine |
| `schema.ts` (extend) | Business Authority | Migration manifest support |
| Update UI | Presentation Authority | React components for update UX |

### 26.2 Phase Plan

| Phase | What | Depends On | Parallelizable |
|-------|------|------------|----------------|
| 1 | `crypto.rs`, `update.rs`, `update_provider.rs`, `update_strategy.rs` | Licensing Rust Core | No |
| 2 | `updater_engine.rs`, `recovery.rs` | Phase 1 | No |
| 3 | Tauri Adapter IPC commands | Phase 2 | With Phase 4 |
| 4 | Frontend update UX | None | With Phase 3 |
| 5 | `stub_updater.rs` | Phase 2 | With Phase 6 |
| 6 | Database migration support (Hono side) | None | With Phase 5 |
| 7 | Portable update support | Phase 2 | With Phase 5, 6 |
| 8 | Release tooling (`sign-update` CLI, CI scripts) | Phase 1 | With all phases |

### 26.3 Testing Strategy

| Test Type | Scope | Tool |
|-----------|-------|------|
| Unit tests | Signature verification, manifest parsing, version checks | `cargo test` |
| Integration tests | End-to-end cycle: package → sign → verify → stage → apply | `cargo test` + shell |
| Integration tests | Database migration execution on test SQLite with failure scenarios | Vitest |
| E2E tests | Full update flow through Tauri (mock provider) | Playwright + Tauri harness |
| Recovery tests | Simulate failure → verify rollback | Shell + `--recover` |
| Portable tests | Update portable folder → data/ untouched | Shell |

### 26.4 ADRs Created

The following ADRs have been created to capture implementation-specific decisions for the update and release system. Each ADR is located at `adr/ADR-UPD-NNN.md`.

| ADR | Topic |
|-----|-------|
| ADR-UPD-001 | [Windows Update Strategy](adr/ADR-UPD-001.md) (stub updater, locked file handling) |
| ADR-UPD-002 | [Recovery Console](adr/ADR-UPD-002.md) (`--recover` command-line flag) |
| ADR-UPD-003 | [Update Packaging](adr/ADR-UPD-003.md) (ZIP, Ed25519 signatures, canonical JSON) |
| ADR-UPD-004 | [Release Pipeline](adr/ADR-UPD-004.md) (GitHub Actions with Environments) |
| ADR-UPD-005 | [Backup Retention Policy](adr/ADR-UPD-005.md) (keep 3 most recent backups) |
| ADR-UPD-006 | [Smoke Test Definition](adr/ADR-UPD-006.md) (binary start, health check, DB open) |
| ADR-UPD-008 | [Enterprise Networking](adr/ADR-UPD-008.md) (proxy environment variables) |

---

## 27. ADR Index

The following ADRs capture implementation-specific decisions for the update and release system. Each is located at `adr/ADR-UPD-NNN.md`.

| ADR | Purpose | When |
|-----|---------|------|
| ADR-UPD-001 | [Windows Update Strategy](adr/ADR-UPD-001.md) (stub updater for locked file handling) | During Phase 3 (Tauri Adapter) |
| ADR-UPD-002 | [Recovery Console](adr/ADR-UPD-002.md) (`--recover` command-line flag) | During Phase 2 (Updater Engine) |
| ADR-UPD-003 | [Update Packaging](adr/ADR-UPD-003.md) (ZIP, Ed25519, canonical JSON, pinned compression) | During Phase 2 (Release tooling) |
| ADR-UPD-004 | [Release Pipeline](adr/ADR-UPD-004.md) (GitHub Actions with Environments) | Before first customer release |
| ADR-UPD-005 | [Backup Retention Policy](adr/ADR-UPD-005.md) (keep 3 most recent backups) | During Phase 2 (Updater Engine) |
| ADR-UPD-006 | [Smoke Test Definition](adr/ADR-UPD-006.md) (binary start, health check, DB open) | During Phase 3 (Tauri Adapter) |
| ADR-UPD-008 | [Enterprise Networking](adr/ADR-UPD-008.md) (proxy env vars, credential sanitization) | During Phase 1 (Update Provider) |

Each ADR must reference ADR-RCA-001 and this architecture document to maintain traceability.

### Related Documents

| Document | Location |
|----------|----------|
| Update & Release PRD | `docs/prd/update-prd.md` |
| Licensing Architecture | `docs/licensing-architecture.md` |
| Rust Core Architecture | `docs/rust-core-architecture.md` |
| Architecture Decisions | `docs/architecture-decisions.md` |
