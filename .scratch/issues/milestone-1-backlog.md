# Milestone 1 -- Implementation Backlog

## Rust Trusted Computing Base

**Target Version:** 0.1.0
**PRDs:** Licensing PRD, Rust Core PRD
**Architecture:** Licensing Architecture, Rust Core Architecture, Update Architecture
**ADRs:** ADR-LIC-001, ADR-RCA-001

---

## Issue M1.1 -- Rust Core Scaffolding and Shared Crypto Module

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Rust Core
**Priority:** High
**Labels:** `area:rust-core`, `priority:high`, `type:feature`, `release:0.1.0`
**Dependencies:** None (first issue)

**Objective:** Establish the Rust Core crate structure, shared cryptographic utilities, and error types that all downstream modules depend on.

### Implementation Tasks

- [ ] Add Rust dependencies to `apps/desktop/src-tauri/Cargo.toml`:
  - `ed25519-dalek = { version = "2", features = ["pkcs8"] }`
  - `base64 = "0.22"` (url-safe variant)
  - `chrono = { version = "0.4", features = ["serde"] }`
  - `serde = { version = "1", features = ["derive"] }`
  - `serde_json = "1"`
- [ ] Create `apps/desktop/src-tauri/src/crypto.rs`:
  - `pub fn ed25519_verify(public_key: &[u8; 32], message: &[u8], signature: &[u8]) -> Result<(), CryptoError>`
  - `pub fn sha256_digest(data: &[u8]) -> [u8; 32]`
  - `pub fn generate_random_bytes(len: usize) -> Result<Vec<u8>, CryptoError>` (wraps `OsRng`)
- [ ] Create `apps/desktop/src-tauri/src/error.rs`:
  - `pub enum RustCoreError` with variants: `InvalidSignature`, `Expired`, `ClockTampered`, `LicenseFileNotFound`, `IoError`, `CryptoError`, `InvalidFormat`, `InvalidPayload`
  - `impl std::fmt::Display` and `impl std::error::Error`
  - Conversion from `std::io::Error` via `From` trait
- [ ] Create `apps/desktop/src-tauri/src/lib.rs` module declarations: `mod crypto; mod error; mod license; mod clock;`

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| Ed25519 verify returns Ok for valid signature | Unit | `cargo test` |
| Ed25519 verify returns Err for tampered message | Unit | `cargo test` |
| Ed25519 verify returns Err for wrong public key | Unit | `cargo test` |
| SHA-256 produces correct digest for known input | Unit | `cargo test` |
| Random bytes produce different values on each call | Unit | `cargo test` |
| `RustCoreError` Display produces human-readable messages | Unit | `cargo test` |
| `RustCoreError` can be converted from `std::io::Error` | Unit | `cargo test` |

### Acceptance Criteria

- [ ] `cargo test` passes for all crypto and error tests.
- [ ] Shared crypto functions are usable from both `license.rs` and `update.rs` without code duplication.
- [ ] No Tauri types are imported in `crypto.rs` or `error.rs`.
- [ ] `RustCoreError` is the standard error type for all Rust Core modules.

### References

- **PRD:** Licensing PRD Section 3.3 (Rust deps), Rust Core PRD Section 3.1
- **Architecture:** Rust Core Architecture Section 6.1 (Rust Core platform library), Licensing Architecture Section 15.3 (dependencies)
- **ADRs:** ADR-LIC-001, ADR-RCA-001

---

## Issue M1.2 -- License Types and Schemas

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Contracts
**Priority:** High
**Labels:** `area:contracts`, `priority:high`, `type:feature`, `release:0.1.0`
**Dependencies:** None (TypeScript-only issue, can run in parallel with M1.1)

**Objective:** Define the shared TypeScript Zod schemas and Rust structs for license payloads, editions, and features.

### Implementation Tasks

- [ ] Create `packages/contracts/src/license.ts`:
  - `editionSchema` (`"standard" | "professional" | "enterprise"`)
  - `licenseTypeSchema` (`"perpetual" | "subscription" | "trial" | "grace"`)
  - `licensedFeatureSchema` (all feature enum values)
  - `licensePayloadSchema` (full signed payload: `licenseId`, `issuedAt`, `issuedTo`, `email`, `edition`, `features`, `maxUsers`, `validFrom`, `validUntil`, `licenseType`, `metadata`)
- [ ] Export all schemas from `packages/contracts/src/index.ts`
- [ ] Verify Zod schema compiles and exports correctly

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| Valid license payload passes schema validation | Unit | `pnpm test:contracts` |
| Missing required field fails validation | Unit | `pnpm test:contracts` |
| Invalid edition string fails validation | Unit | `pnpm test:contracts` |
| Feature list with invalid values fails validation | Unit | `pnpm test:contracts` |

### Acceptance Criteria

- [ ] `packages/contracts` builds without errors.
- [ ] All license schemas are exported and can be imported by `@tuari/contracts` consumers.
- [ ] The Zod schemas match the Rust `LicensePayload` struct field-by-field.

### References

- **PRD:** Licensing PRD F1, F2
- **Architecture:** Licensing Architecture Section 2.2 (license payload format), Section 4.3 (feature enum)
- **ADRs:** ADR-LIC-001

---

## Issue M1.3 -- LicenseManager Core Logic

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Licensing
**Priority:** High
**Labels:** `area:licensing`, `area:rust-core`, `priority:high`, `type:feature`, `release:0.1.0`
**Dependencies:** M1.1 (crypto, error types)

**Objective:** Implement the `LicenseManager` struct in `license.rs` -- the single source of truth for all licensing state.

### Implementation Tasks

- [ ] Create `apps/desktop/src-tauri/src/license.rs`:
  - `LicenseInfo` struct (decoded, validated license payload)
  - `LicenseStatus` enum (`Active`, `Trial`, `Expired`, `Grace`)
  - `ActivationResult` struct
  - `LicenseManager` struct with fields: `license: Mutex<Option<LicenseInfo>>`, `trusted_keys: Vec<VerifyingKey>`
- [ ] Implement `LicenseManager::initialize()`:
  - Read `license.lic` from disk
  - Verify Ed25519 signature using `crypto::ed25519_verify()`
  - Parse JSON payload
  - Validate dates (check `validFrom`, `validUntil` against current time)
  - Return `LicenseInfo` or `RustCoreError`
- [ ] Implement `LicenseManager::activate()`:
  - Accept raw `.lic` file content
  - Verify signature
  - Validate payload
  - Write to `license.lic` on disk
  - Return `ActivationResult`
- [ ] Implement public accessors:
  - `edition() -> &str`
  - `status() -> LicenseStatus`
  - `has_feature(feature: LicensedFeature) -> bool`
  - `customer() -> Option<CustomerInfo>`
  - `limits() -> Limits` (contains `max_users: u32`)
  - `expires_at() -> Option<DateTime<Utc>>`
  - `to_env_map() -> HashMap<String, String>` (serialize to structured env vars)
- [ ] Implement `verify_signature()`:
  - Parse `payload_b64.signature_b64`
  - Base64url decode both parts
  - Call `crypto::ed25519_verify()` against each trusted key
  - Return `Ok` or `RustCoreError::InvalidSignature`

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| `initialize()` with valid license file returns `Ok` | Unit | `cargo test` |
| `initialize()` with tampered license returns `Err(InvalidSignature)` | Unit | `cargo test` |
| `initialize()` with missing license returns `Err(LicenseFileNotFound)` | Unit | `cargo test` |
| `initialize()` with expired license returns `Err(Expired)` | Unit | `cargo test` |
| `activate()` with valid content writes file and returns `Ok` | Unit (temp dir) | `cargo test` |
| `activate()` with invalid content returns `Err` and does NOT write file | Unit (temp dir) | `cargo test` |
| `edition()` returns correct value after activation | Unit | `cargo test` |
| `has_feature()` returns correct values per edition | Unit | `cargo test` |
| `to_env_map()` produces expected env var names | Unit | `cargo test` |
| `LicenseManager` is `Send + Sync` (safe to wrap in `Mutex`) | Compile | `cargo check` |

### Acceptance Criteria

- [ ] All tests pass.
- [ ] `LicenseManager` is the **only** module that reads/writes `license.lic`.
- [ ] No Tauri types are imported in `license.rs`.
- [ ] The public API matches the interface defined in Licensing Architecture Section 15.1.

### References

- **PRD:** Licensing PRD F1, F5, F11
- **Architecture:** Licensing Architecture Section 15.1 (LicenseManager API), Section 2.3 (validation algorithm)
- **ADRs:** ADR-LIC-001

---

## Issue M1.4 -- Clock Tracker and Grace Period

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Rust Core
**Priority:** High
**Labels:** `area:rust-core`, `area:licensing`, `priority:high`, `type:feature`, `release:0.1.0`
**Dependencies:** M1.1 (error types), M1.3 (LicenseManager depends on clock)

**Objective:** Implement monotonic clock tamper detection and grace period management.

### Implementation Tasks

- [ ] Create `apps/desktop/src-tauri/src/clock.rs`:
  - `ClockTracker` struct
  - `ClockStatus` enum (`Trusted(DateTime<Utc>)`, `Suspicious { estimated_time: DateTime<Utc>, reason: String }`)
  - `pub fn check_clock_consistency(state_dir: &Path) -> Result<ClockStatus, RustCoreError>`
  - `pub fn update_tracker(state_dir: &Path, clock_status: &ClockStatus) -> Result<(), RustCoreError>`
- [ ] `clock-tracker.json` file I/O:
  - Stores: `last_seen_wall: i64`, `last_monotonic_nanos: u64`, `install_wall: i64`
  - Read on startup, write on shutdown
  - Handle missing file (first run)
- [ ] Monotonic clock comparison:
  - Compare wall clock against stored `last_seen_wall`
  - Compare delta against elapsed monotonic time (`std::time::Instant`)
  - Tolerance window: 24 hours
  - If clock set back beyond tolerance -> `Suspicious` with estimated time
- [ ] Grace period management:
  - `install-timestamp` file I/O
  - `fn grace_remaining(state_dir: &Path) -> Result<Option<Duration>, RustCoreError>`
  - 30-day grace from install timestamp
- [ ] Three-phase expiry:
  - `fn expiry_phase(license: &LicenseInfo) -> ExpiryPhase` enum: `Active`, `Warning`, `ExpiredGrace`, `Locked`
  - Warning: 30 days before `validUntil`
  - Expired grace: 30 days after `validUntil`
  - Locked: 31+ days after `validUntil`

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| Clock tracker file created on first call | Unit (temp dir) | `cargo test` |
| Normal clock returns `Trusted` | Unit | `cargo test` |
| Clock set back 48h returns `Suspicious` | Unit | `cargo test` |
| Estimated time matches wall + monotonic in Suspicious mode | Unit | `cargo test` |
| Grace period returns correct remaining days | Unit (temp dir) | `cargo test` |
| Grace expired returns `None` remaining | Unit (temp dir) | `cargo test` |
| Expiry phases transition correctly with date shifts | Unit | `cargo test` |

### Acceptance Criteria

- [ ] Clock consistency can be determined without panicking on any system time configuration.
- [ ] Grace period is calculated from `install-timestamp` file.
- [ ] The app never locks solely due to clock suspicion (graceful degradation).
- [ ] No Tauri types imported in `clock.rs`.

### References

- **PRD:** Licensing PRD F6, F7, F8
- **Architecture:** Licensing Architecture Section 7 (clock consistency), Section 6.2 (grace period)
- **ADRs:** ADR-LIC-001

---

## Issue M1.5 -- Key Rotation and Trust Chain

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Licensing
**Priority:** Medium
**Labels:** `area:licensing`, `area:rust-core`, `priority:medium`, `type:feature`, `release:0.1.0`
**Dependencies:** M1.1 (crypto)

**Objective:** Implement key rotation certificate loading and multi-key trust management.

### Implementation Tasks

- [ ] Define key rotation certificate format:
  - JSON with fields: `type: "key_rotation"`, `newPublicKey` (base64), `effectiveFrom`, `previousKeyId`, `rotationReason`, `rootCaSignature`
- [ ] Implement `load_rotation_certificates(data_dir: &Path) -> Result<Vec<VerifyingKey>, RustCoreError>`:
  - Scan `<data_dir>/` for files matching `key-rotation-*.json`
  - Verify each file's Root CA signature
  - Extract and return the new public keys
- [ ] Implement `build_trusted_key_list(data_dir: &Path) -> Result<Vec<VerifyingKey>, RustCoreError>`:
  - Start with embedded `PUBLIC_KEY`
  - Add keys from rotation certificates
  - Return combined list for `LicenseManager`

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| Valid rotation certificate adds key to trusted list | Unit (temp dir) | `cargo test` |
| Invalid rotation certificate signature is rejected | Unit | `cargo test` |
| Multiple rotation certificates all contribute keys | Unit (temp dir) | `cargo test` |
| No certificate files -> only embedded key trusted | Unit (temp dir) | `cargo test` |
| Corrupted certificate file is skipped (logged, not fatal) | Unit (temp dir) | `cargo test` |

### Acceptance Criteria

- [ ] Rotation certificates follow the same Root CA trust chain as licensing keys.
- [ ] All trusted keys are verified at startup.
- [ ] A corrupted or invalid certificate does not prevent the application from starting (graceful degradation).

### References

- **PRD:** Licensing PRD F13
- **Architecture:** Licensing Architecture Section 3.5 (key rotation), Section 3.2 (key hierarchy)
- **ADRs:** ADR-LIC-001

---

## Issue M1.6 -- License Enforcement (APP_DB_KEY Stripping)

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Desktop (Tauri Adapter)
**Priority:** High
**Labels:** `area:desktop`, `area:licensing`, `priority:high`, `type:feature`, `release:0.1.0`
**Dependencies:** M1.3 (LicenseManager), M1.1 (for `.env_clear()` support)

**Objective:** Implement Rust-enforced feature gating for the encrypted database feature.

### Implementation Tasks

- [ ] Modify `spawn_api_process()` in `lib.rs`:
  - Before spawning, check `license_manager.has_feature(EncryptedDb)`
  - If not licensed and `APP_DB_KEY` is present: log warning, do NOT pass key to sidecar
- [ ] Ensure `.env_clear()` is called on the `Command` builder:
  - Build a clean environment from scratch
  - Only explicitly allowed env vars are passed (including `TUARI_LICENSE_*`)
  - `APP_DB_KEY` is passed ONLY if `has_feature(EncryptedDb)` returns true
- [ ] Integration test (manual verification): set `APP_DB_KEY` without Enterprise license -> sidecar cannot read database

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| `APP_DB_KEY` stripped when license lacks `EncryptedDb` | Integration (mock license) | `cargo test` |
| `APP_DB_KEY` passed when license includes `EncryptedDb` | Integration (mock license) | `cargo test` |
| `.env_clear()` removes all inherited environment variables | Unit | `cargo test` |
| Sidecar env contains only explicitly allowed vars | Integration | `cargo test` |

### Acceptance Criteria

- [ ] The encrypted database feature is truly Rust-enforced (patching the sidecar cannot bypass it).
- [ ] The sidecar environment is constructed from scratch with `.env_clear()`.
- [ ] Existing `env::var()` usage in the sidecar is unaffected (the allowed vars are identical to current behavior).

### References

- **PRD:** Licensing PRD F3
- **Architecture:** Licensing Architecture Section 5.2.1 (encrypted database gate), Section 5.2.2 (env stripping)
- **ADRs:** ADR-LIC-001, ADR-RCA-001

---

## Issue M1.7 -- License Generation CLI Tool

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** CLI
**Priority:** High
**Labels:** `area:cli`, `priority:high`, `type:feature`, `release:0.1.0`
**Dependencies:** None (pure Node.js, no Rust dependency)

**Objective:** Create an internal CLI tool for generating signed license files.

### Implementation Tasks

- [ ] Create `scripts/generate-license.mjs`:
  - Accept `--private-key` (PEM file path)
  - Accept `--edition`, `--issued-to`, `--email`, `--valid-until`, `--max-users`, `--features`, `--output`
  - Read private key, sign JSON payload, produce `.lic` file
- [ ] Output format: `<base64url(payload)>.<base64url(signature)>`
- [ ] Generate dev key pair (`scripts/generate-dev-keys.mjs`) for CI/testing
- [ ] Document usage in a comment header of the script

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| Generated license can be verified by `LicenseManager` | Integration | Shell script calling both tools |
| CLI exits with non-zero on missing required args | Unit | Node test |
| CLI produces valid `.lic` file | Integration | Shell script |
| Dev key pair generation works | Manual | Run script |

### Acceptance Criteria

- [ ] The CLI tool produces files that pass `LicenseManager::activate()`.
- [ ] The tool is documented in `scripts/README.md` or equivalent.
- [ ] Dev keys are committed to the repository for CI use.
- [ ] Production keys are **not** committed (document the key management process).

### References

- **PRD:** Licensing PRD F12
- **Architecture:** Licensing Architecture Section 15.7 (license generation CLI)
- **ADRs:** ADR-LIC-001

---

## Issue M1.8 -- Trust Authority Capability Stubs

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Rust Core
**Priority:** Medium
**Labels:** `area:rust-core`, `priority:medium`, `type:architecture`, `release:0.1.0`
**Dependencies:** M1.3 (LicenseManager)

**Objective:** Define the architectural boundary between Rust Core and Tauri Adapter with clear interface stubs.

### Implementation Tasks

- [ ] Document the Rust Core public interface in module doc comments:
  - `pub mod license` -- exports: `LicenseManager`, `LicenseInfo`, `LicenseStatus`, `LicensedFeature`, `Edition`
  - `pub mod crypto` -- exports: `ed25519_verify`, `sha256_digest`, `generate_random_bytes`
  - `pub mod clock` -- exports: `ClockTracker`, `ClockStatus`, `check_clock_consistency`, `grace_remaining`
  - `pub mod error` -- exports: `RustCoreError`
- [ ] Ensure `lib.rs` re-exports the public API:
  - `pub use license::LicenseManager;`
  - `pub use error::RustCoreError;`
  - etc.
- [ ] Verify that `lib.rs` (Tauri Adapter) can call all Rust Core functions without circular dependencies.
- [ ] Document: "The Rust Core must not import `tauri::`. If a function needs Tauri types, it must be implemented in `lib.rs` and call into Rust Core for pure logic."

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| `cargo check` passes (no import errors) | Compile | `cargo check` |
| No `tauri::` imports exist in `crypto.rs`, `license.rs`, `clock.rs`, `error.rs` | Audit | `grep` / review |

### Acceptance Criteria

- [ ] The Rust Core module boundaries are clear.
- [ ] A developer adding a new Rust Core module knows exactly where to put it and what it must not depend on.
- [ ] `cargo test` + `cargo check` pass.

### References

- **PRD:** Rust Core PRD Section 3.1, 3.2
- **Architecture:** Rust Core Architecture Section 6.1 (Rust Core platform library), Section 6.2 (Tauri Adapter boundary)
- **ADRs:** ADR-RCA-001

---

## Issue M1.9 -- Recovery Primitives

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Rust Core
**Priority:** Medium
**Labels:** `area:rust-core`, `priority:medium`, `type:feature`, `release:0.1.0`
**Dependencies:** M1.1 (error types)

**Objective:** Build the minimal file-system recovery utilities that the Recovery Environment will later consume.

### Implementation Tasks

- [ ] Create `apps/desktop/src-tauri/src/recovery.rs`:
  - `pub fn backup_directory(source: &Path, backup: &Path) -> Result<(), RustCoreError>`
  - `pub fn restore_directory(backup: &Path, target: &Path) -> Result<(), RustCoreError>`
  - `pub fn backup_file(source: &Path, backup: &Path) -> Result<(), RustCoreError>`
  - `pub fn restore_file(backup: &Path, target: &Path) -> Result<(), RustCoreError>`
  - `pub fn atomic_rename(source: &Path, target: &Path) -> Result<(), RustCoreError>`
  - `pub fn disk_space_available(path: &Path) -> Result<u64, RustCoreError>`
- [ ] Implement with `std::fs` and `std::path` only (no Tauri, no external crates).
- [ ] Add `--recover` flag detection stub in `main.rs` (parses args, sets a flag, but actual recovery flow deferred to Milestone 2).

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| `backup_directory` creates an identical copy | Unit (temp dir) | `cargo test` |
| `restore_directory` restores files correctly | Unit (temp dir) | `cargo test` |
| `backup_file` copies single file | Unit (temp dir) | `cargo test` |
| `atomic_rename` replaces target atomically | Unit (temp dir) | `cargo test` |
| `disk_space_available` returns non-zero | Unit | `cargo test` |
| Recovery functions return `RustCoreError` on failure | Unit | `cargo test` |

### Acceptance Criteria

- [ ] All recovery functions use only `std::fs` and `std::path`.
- [ ] No Tauri types imported in `recovery.rs`.
- [ ] The `--recover` flag is recognized but no recovery flow is implemented (placeholder for Milestone 2).

### References

- **PRD:** Update PRD F10
- **Architecture:** Update Architecture Section 20 (Recovery Environment)
- **ADRs:** ADR-RCA-001

---

## Issue M1.10 -- Milestone Integration Tests

**Milestone:** Milestone 1 -- Trusted Computing Base
**Target Version:** 0.1.0
**Epic:** M1 -- Trusted Computing Base
**Area:** Testing
**Priority:** High
**Labels:** `area:testing`, `priority:high`, `type:test`, `release:0.1.0`
**Dependencies:** M1.1 through M1.9

**Objective:** Verify that all Milestone 1 modules work together as a coherent Trust Authority.

### Implementation Tasks

- [ ] Create `apps/desktop/src-tauri/tests/m1_integration.rs`:
- [ ] **End-to-end license lifecycle:**
  1. Generate license file (via `generate-license.mjs`)
  2. Call `LicenseManager::initialize()` -> verify `edition()` returns correct value
  3. Call `has_feature(LanServer)` -> verify returns correct value for given edition
  4. Call `expires_at()` -> verify matches expected
  5. Call `to_env_map()` -> verify contains `TUARI_LICENSE_EDITION`
- [ ] **Tamper detection:**
  1. Tamper with `license.lic` (modify a byte)
  2. Call `LicenseManager::initialize()` -> verify returns `Err(InvalidSignature)`
- [ ] **Grace period:**
  1. Remove license file
  2. Call `grace_remaining()` -> verify returns 30 days
  3. Touch `install-timestamp` with 31-day-old date -> verify grace expired
- [ ] **Clock tampering:**
  1. Set up clock tracker with a future timestamp
  2. Call `check_clock_consistency()` -> verify returns `Suspicious`
- [ ] **Key rotation:**
  1. Place a valid rotation certificate in the data directory
  2. Call `LicenseManager::initialize()` -> verify new key is trusted
- [ ] **Recovery primitives:**
  1. Create a directory with test files
  2. Call `backup_directory()` followed by `restore_directory()` -> verify contents match
- [ ] **Rust Core boundary:**
  1. Verify `crypto.rs`, `license.rs`, `clock.rs`, `recovery.rs`, `error.rs` have zero `tauri::` imports
  2. Verify `LicenseManager` is `Send + Sync`

### Testing Requirements

| Test | Type | Tool |
|------|------|------|
| All tests above pass as integration tests | Integration | `cargo test --test m1_integration` |
| No Tauri imports in core modules (audit) | Audit | Script or CI check |

### Acceptance Criteria

- [ ] The integration test covers the full licensed and unlicensed paths.
- [ ] The test uses temporary directories (no side effects on the development environment).
- [ ] All tests are runnable with a single `cargo test` command.

### References

- **PRD:** Licensing PRD Section 9 (release criteria), Rust Core PRD Section 9 (release criteria)
- **Architecture:** All three architecture documents
- **ADRs:** ADR-LIC-001, ADR-RCA-001

---

## Dependency Graph

```
M1.7 (CLI tool)       M1.2 (types/schemas)
    |                      |
    |                      |
    +-- M1.1 (crypto/errors) <----- (no deps)
    |       |
    |       +-- M1.3 (LicenseManager) <--- M1.4 (clock/grace)
    |               |
    |               |-- M1.6 (APP_DB_KEY enforcement)
    |               +-- M1.8 (Trust Authority stubs)
    |
    +-- M1.5 (key rotation)
    |
    |-- M1.9 (recovery primitives) ---- (no deps beyond M1.1)
    |
    +-- M1.10 (integration tests) <--- depends on all
```

## Parallelization

| Track A (Rust Core) | Track B (Types + Keys) | Track C (Tools) |
|---------------------|----------------------|----------------|
| M1.1 -> M1.3 -> M1.4 -> M1.6 -> M1.10 | M1.2 -> M1.5 -> M1.8 | M1.7 -> M1.9 |

## Complexity Estimates

| Issue | Complexity | Rationale |
|-------|-----------|-----------|
| M1.1 - Scaffolding + crypto | **M** | New deps, module structure, 3 crypto functions, error enum |
| M1.2 - Types/schemas | **S** | Zod schemas only, pure TypeScript |
| M1.3 - LicenseManager | **L** | Core business logic, signature verification, file I/O, 10+ public methods |
| M1.4 - Clock + grace period | **M** | File I/O, monotonic clock logic, date math, three-phase expiry |
| M1.5 - Key rotation | **S** | Certificate loading, Root CA verification |
| M1.6 - APP_DB_KEY enforcement | **S** | Modify existing `spawn_api_process()`, `.env_clear()` logic |
| M1.7 - CLI tool | **S** | Pure Node.js, no Rust, straightforward JSON signing |
| M1.8 - Trust Authority stubs | **S** | Module documentation, re-exports, audit |
| M1.9 - Recovery primitives | **S** | File system utilities, `std::fs` only |
| M1.10 - Integration tests | **M** | End-to-end scenarios, multiple module coordination |
