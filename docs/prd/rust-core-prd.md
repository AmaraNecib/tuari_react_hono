# Rust Core Architecture — Product Requirements Document (PRD)

**PRD ID:** PRD-RCA-001
**Status:** Approved
**Architecture:** `docs/rust-core-architecture.md`
**ADRs:** ADR-RCA-001
**Date:** 2026-06-30
**Supersedes:** N/A — foundation document

---

## 1. Overview

### 1.1 Purpose
Define the permanent architectural boundaries between the **Trust Authority (Rust)**, **Business Authority (Hono/TypeScript)**, and **Presentation Authority (React)**. This document establishes the decision framework for the lifetime of the project.

### 1.2 Scope
- Three-authority model: Trust, Business, Presentation
- 11 architectural principles (P1–P11)
- Layer definitions and trust model
- Services provided by Rust (License, Secret, Runtime, Identity)
- Business Authority responsibilities and boundaries
- Presentation Authority responsibilities and boundaries
- Cross-layer communication rules
- What must never leave the Trust Authority
- Decision framework for future Trust vs Business vs Presentation decisions
- Strategic business asset identification
- Duplicate prevention rules
- Error handling philosophy
- ADR: Rust as the Trusted Computing Base
- Five-year evolution path

### 1.3 Out of Scope
- Implementation details of specific business features
- Database schema design
- UI component library decisions
- Build pipeline configuration
- Transport mechanism for Trust → Business communication (env vars, IPC, etc.)

---

## 2. Architectural Principles (P1–P11)

### The Three Authorities

| Authority | Owner | Responsibility |
|-----------|-------|---------------|
| **Trust Authority** | Rust | Cryptography, secrets, licensing, secure updates, trust decisions |
| **Business Authority** | Hono (TypeScript) | Business workflows, validation, CRUD, reporting, domain logic |
| **Presentation Authority** | React (TypeScript) | UI rendering, user interaction, client-side state, UX |

### P1: Rust Is the Trust Authority
All **trust-deciding** cryptographic operations, secret management, license verification, and integrity checks execute in Rust. No other layer performs trust-deciding cryptographic operations.

### P2: Hono Is the Business Authority
Hono orchestrates all business operations. Rust does not contain business logic. Exception: business rules with security/financial integrity implications may receive parallel Rust enforcement after a documented security review.

### P3: React Is the Presentation Authority
Frontend renders UI and never makes trust decisions, never validates signatures, never stores secrets, and never enforces feature gates.

### P4: Secrets Never Cross Trust Boundaries
Secrets are accessible only within their owning authority. No secret reaches the Presentation Authority.

### P5: Cryptographic Verification Only in the Trust Authority
All trust-deciding crypto executes in Rust. The Business and Presentation authorities never import cryptographic libraries for trust decisions.

### P6: Business Rules — One Authoritative Location
Each business rule has exactly one authoritative location: the Business Authority (Hono). Presentation Authority duplication for UX is acceptable if it defers to Hono.

### P7: Every Layer Is Replaceable
Any layer could be replaced without rewriting the others.

### P8: Offline-First by Default
All features work without internet.

### P9: Least Privilege for the Sidecar
The sidecar executes with an explicitly defined environment. No inherited environment variables are trusted. The Trust Authority controls exactly which information reaches the sidecar.

### P10: The Trust Authority Is the Root of Trust
The Rust codebase is the smallest, most auditable, and most protected codebase in the system.

### P11: Business Workflows Remain in Hono Unless Justified
Business workflows belong in the Business Authority (Hono). They may move to the Trust Authority (Rust) only when there is a compelling security, integrity, or platform-level reason — never for convenience or performance speculation.

---

## 3. Layer Responsibilities

### 3.1 Trust Authority — Rust Core (Current)

| Responsibility | Module |
|---------------|--------|
| Ed25519 license verification | `license.rs` (planned) |
| Random secret generation (OsRng) | `lib.rs` (existing) |
| Controlled sidecar environment provisioning (no inherited env vars) | `lib.rs` (needs hardening) |
| Sidecar process lifecycle (spawn, health-check, kill) | `lib.rs` (existing) |
| File path resolution, legacy migration | `lib.rs` (existing) |
| OS keyring access | `lib.rs` (existing) |

### 3.2 Trust Authority — Rust Core (Future)

| Responsibility | Trigger |
|---------------|---------|
| Clock tampering detection (monotonic tracker) | Licensing |
| Key rotation certificate loading | Licensing |
| Grace period management | Licensing |
| Update package verification + application | Update Architecture |
| Database encryption key enforcement | Licensing + Security |

### 3.3 Business Authority — Hono Sidecar (Current)

| Responsibility |
|---------------|
| HTTP server, oRPC transport |
| All business logic (employees, projects, warehouses, debts, inventory, invoices, payments) |
| CRUD operations + input validation (Zod) |
| Authentication (Better Auth) + authorization (RBAC) |
| Audit logging (event sourcing via history tables) |
| Database access (Drizzle + raw SQLite) |
| File management (invoice attachments) |
| Reporting + rate limiting |

### 3.4 Presentation Authority — React Frontend (Current)

| Responsibility |
|---------------|
| UI rendering (all components, pages, forms, tables) |
| Client-side routing (TanStack Router) |
| Server state management (TanStack Query) |
| User input handling + validation feedback |
| Internationalization (Arabic/English, RTL/LTR) |
| Theme management |
| Desktop integration (runtime config, auth bridge) |

### 3.5 Tauri Adapter (Desktop Bindings)

| Responsibility |
|---------------|
| Sidecar process lifecycle (spawn, health-check, kill) |
| Tauri command handlers (`#[tauri::command]` functions) |
| IPC routing between frontend and Rust Core |
| Portable mode detection |
| Legacy file migration |
| File path resolution (calls Rust Core helpers) |
| OS keyring access |

---

## 4. Public API (Services Provided by Rust)

### 4.1 Tauri Commands (Trust Authority → Presentation Authority)

| Command | Status |
|---------|--------|
| `get_runtime_config` | Existing |
| `desktop_api_request` | Existing |
| `desktop_sign_in_with_phone_number` | Existing |
| `desktop_change_password` | Existing |
| `desktop_sign_out_session` | Existing |
| `activate_license` | Planned |
| `get_license_status` | Planned |

### 4.2 Services (Trust Authority → Business Authority) — Logical Interface

These services define **what** Rust provides, not **how** they are transported.

| Service | Methods | Status |
|---------|---------|--------|
| **License Service** | `edition()`, `status()`, `hasFeature()`, `customer()`, `limits()`, `expiresAt()`, `activate()` | Planned |
| **Secret Service** | `injectBetterAuthSecret()`, `filterDatabaseKey()` | Existing (needs hardening) |
| **Runtime Service** | `resolveRuntimeConfig()`, `sidecarEnvironment()`, `healthCheck()` | Existing |
| **Identity Service** | `signIn()`, `signOut()`, `changePassword()`, `apiRequest()` | Existing |

*Note: Current implementation uses environment variables + Tauri IPC. This is an implementation detail — the service interface is the architectural contract.*

---

## 5. Architecture Requirements

### R1: Layer Isolation
- [ ] The Trust Authority and Business Authority MUST NOT share the same process address space (separate OS processes).
- [ ] The Presentation Authority MUST NOT access the SQLite database directly.
- [ ] The Presentation Authority MUST NOT call Trust Authority functions except through named Tauri commands.

### R2: Sidecar Environment Control
- [ ] The sidecar MUST execute with an **explicitly defined environment** — no inherited environment variables are trusted.
- [ ] The Trust Authority (Rust) controls exactly which information reaches the sidecar.
- [ ] If a secret (e.g., `APP_DB_KEY`) is not licensed, it MUST NOT reach the sidecar at all.

### R3: Cryptographic Boundary
- [ ] All trust-deciding cryptographic operations execute only in the Trust Authority (Rust).
- [ ] The Business Authority (Hono) MUST NOT import cryptographic libraries for trust decisions.
- [ ] The Presentation Authority (React) MUST NOT perform trust-deciding cryptographic operations.
- [ ] The Presentation Authority may use browser SubtleCrypto for non-trust utility operations.

### R4: Decision Framework
- [ ] Every new feature MUST have a documented decision using the three-authority model (Trust / Business / Presentation).
- [ ] Business workflows default to the Business Authority (Hono) unless there is a compelling security, integrity, or platform-level reason to move them to the Trust Authority.
- [ ] If a feature is moved to Rust, a before/after benchmark MUST accompany the change.

### R5: Duplicate Prevention
- [ ] Every duplicated business rule MUST document which authority is authoritative.
- [ ] Code review MUST check for unintended duplication.

### R6: Error Handling
- [ ] Trust Authority functions MUST return `Result<T, RustCoreError>` and MUST NOT panic in production paths.
- [ ] Tauri command handlers MUST catch panics via `std::panic::catch_unwind`.

### R7: Strategic Asset Protection
- [ ] Strategic business assets (Section 14 of architecture) are identified and documented.
- [ ] Assets with the highest protection priority (debt/accounting engine, license.rs) receive the highest review scrutiny.

### R8: Rust Core / Tauri Adapter Separation
- [ ] The Rust Core (platform library) must contain **no Tauri types, no Tauri imports, no desktop-specific APIs**.
- [ ] The Tauri Adapter is the **only** layer that imports `tauri::`.
- [ ] The Rust Core must compile and be testable with `cargo test` without any Tauri harness.
- [ ] The Rust Core must be usable from CLI tools, maintenance utilities, and testing harnesses without a Tauri dependency.
- [ ] The Trust Authority's service interface is subject to semantic versioning. Breaking changes require a major version bump.
- [ ] Transport mechanism changes must not change the service interface contract.

---

## 6. User Stories

- **US-001:** As an architect, I want clear principles for Trust vs Business vs Presentation decisions so that the codebase maintains consistent separation of concerns.
- **US-002:** As a developer, I want to know which authority owns a given responsibility so that I know where to add new code.
- **US-003:** As a security reviewer, I want to know which operations are Trust-enforced vs Business-enforced so that I can assess the security model.
- **US-004:** As a maintainer, I want a documented service interface (what Rust provides) so that I can evolve each authority independently.

---

## 7. Non-Functional Requirements

| NFR | Requirement |
|-----|-------------|
| NFR-1 | Architectural principles must be reviewed annually and updated if project needs change. |
| NFR-2 | The Rust Core modules must remain Tauri-independent (no `tauri::` imports in core modules). |
| NFR-3 | The Trust → Business service interface is subject to semantic versioning. Breaking changes require a major version bump. |

---

## 8. Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| Existing Rust code in `lib.rs` | Internal | Sidecar spawning must be hardened for controlled environment |
| `license.rs` (planned) | Internal | Created by Licensing implementation |
| `clock.rs` (planned) | Internal | Created by Licensing implementation |
| No new external Rust crates beyond licensing | — | Decision framework for future additions |
| No new TypeScript dependencies | — | Decision framework applies |

---

## 9. Release Criteria

- [ ] All 11 architectural principles (P1–P11) are documented and approved.
- [ ] The three-authority model (Trust / Business / Presentation) is documented.
- [ ] Strategic business assets are identified in the architecture document (Section 14).
- [ ] ADR-RCA-001 (Rust as Trusted Computing Base) is documented in the architecture document (Section 19).
- [ ] Layer boundaries are enforced in code:
  - [ ] The sidecar executes with an explicitly defined environment.
  - [ ] No SQLite access from the Presentation Authority or Trust Authority.
  - [ ] Rust Core modules do not import Tauri types.
- [ ] The service interface (what Rust provides) is documented and stable.
- [ ] Decision framework is documented and followed by the team.
- [ ] This document is reviewed and approved by the architecture team.
- [ ] A copy of this document is added to `docs/ARCHITECTURE.md`.
- [ ] A copy of ADR-RCA-001 is added to `docs/architecture-decisions.md`.
