# Rust Core Architecture — Revised Canonical Design

**Author:** Lead Software Architect
**Date:** 2026-06-30
**Status:** Approved
**Priority:** P0 — Must be defined before any other architecture work
**Supersedes:** Draft version (all grill findings incorporated)

---

## Table of Contents

1. Architectural Principles
2. Layers & Trust Model
3. Rust Core — Responsibilities
4. Hono (TypeScript API Sidecar) — Responsibilities
5. React Frontend — Responsibilities
6. Tauri Shell — Responsibilities
7. Public API Exposed by Rust
8. Cross-Layer Communication Patterns
9. What Must Never Leave Rust
10. What Must Remain in Hono
11. What Belongs in the Frontend
12. Security-Critical Modules
13. Performance-Critical Modules
14. Intellectual Property — Core Modules
15. Decision Framework: Rust vs TypeScript
16. Preventing Duplicate Implementations
17. Error Handling Philosophy
18. Five-Year Evolution Path
19. Open Questions (Deferred)

---

## 0. Architectural Goals

These goals explain **why** the architecture is structured as it is. Every principle, boundary, and decision in this document serves one or more of these goals.

| Goal | Description | Served By |
|------|-------------|-----------|
| **Minimize the Trusted Computing Base** | The Trust Authority (Rust) should be as small as possible — only code that absolutely requires native trust lives here. Every line of Rust that is not strictly necessary is a liability. | P1, P10, P11, Section 15 |
| **Maximize Replaceability** | Any authority can be replaced without rewriting the others. Rust could become Go; Hono could become Fastify; React could become Solid. The service interfaces are the contracts. | P7, Section 7 |
| **Keep Business Logic Independent of Platform** | Business workflows must not depend on desktop APIs, OS features, or native code. They run identically in desktop, server, and test environments. | P2, P11, Section 10 |
| **Keep Cryptographic Trust Centralized** | All trust-deciding operations live in exactly one place — the Trust Authority. No other layer can make a trust decision. | P1, P5, Section 9 |
| **Prefer Explicit Boundaries Over Implicit Coupling** | Every cross-authority communication uses a documented service interface. No shared memory, no global state, no implicit dependencies. | Section 7, Section 8 |
| **Defend Strategic Assets First** | The highest-value IP (licensing, accounting engine, debt engine) receives the strongest architectural protection — compiled native code for the Trust Authority, clear domain boundaries for the Business Authority. | Section 14 |

---

## 1. Architectural Principles

These principles are **binding** for the lifetime of the project. Every architectural decision, code review, and feature proposal must be evaluated against them.

### Three Authorities

The architecture recognizes three distinct authorities. Every component belongs to exactly one.

| Authority | Owner | Responsibility |
|-----------|-------|---------------|
| **Trust Authority** | Rust | Cryptography, secrets, licensing, secure updates, trust decisions |
| **Business Authority** | Hono (TypeScript) | Business workflows, validation, CRUD, reporting, domain logic |
| **Presentation Authority** | React (TypeScript) | UI rendering, user interaction, client-side state, UX |

These terms are used consistently throughout this document and all future architectural decisions.

### P1. Rust Is the Trust Authority
All **trust-deciding** cryptographic operations, secret management, license verification, and integrity checks execute in Rust. No other layer performs trust-deciding cryptographic operations. The WebView and Hono sidecar operate on a "need to know" basis — they receive information that Rust has already validated, never raw credentials or secrets.

*Clarification: The frontend may use browser SubtleCrypto for non-trust purposes (e.g., hashing a file before upload for size comparison). This does not violate P1 because the frontend is not making a trust decision — it's performing a local utility operation.*

### P2. Hono Is the Business Authority
Hono (the TypeScript API sidecar) orchestrates all business operations. The Business Authority owns:
- **Domain models** (employee, project, warehouse, debt_account, invoice, etc.)
- **Business invariants** ("a worker must have an active manager", "a debt account cannot have a negative balance for PAYABLE direction")
- **Orchestration** (multi-step workflows: creating an invoice creates debt entries, updates inventory, generates audit logs)
- **Workflow composition** (connecting domain operations into business processes)

Rust does not contain business logic. The Trust Authority never accumulates domain models, business invariants, or workflow orchestration. Rust should **never** become the place where normal application workflows accumulate.

*Exception: If a business rule has security or financial integrity implications that make it a target for bypass, it may receive parallel enforcement in Rust. This requires a documented security review. The primary business logic remains in Hono.*

### P3. React Is the Presentation Authority
The frontend renders UI, handles user input, and displays data. It never makes trust decisions, never validates signatures, never stores secrets, and never enforces feature gates. All enforcement is downstream (Trust Authority or Business Authority).

### P4. Secrets Never Cross Trust Boundaries
A secret (private key, database encryption key, signing key, auth token) is accessible only within the Trust Authority (Rust). Secrets are passed to the Business Authority through controlled, auditable mechanisms. No secret ever reaches the Presentation Authority (React).

### P5. Cryptographic Verification Is Performed Only in the Trust Authority
Ed25519 signature verification, SHA-256 hashing for integrity checks, and any future cryptographic operation used for trust decisions execute in Rust. The Business and Presentation authorities never import cryptographic libraries for trust decisions.

### P6. Business Rules Have One Authoritative Location — the Business Authority
A business rule (e.g., "a worker must have an active manager assignment") has exactly one **authoritative** location — the Hono service layer. The Presentation Authority may duplicate validation for UX (instant feedback) but must always defer to the Business Authority for enforcement. If a rule is duplicated, the authoritative layer must be documented in the code.

### P11. Business Workflows Remain in Hono Unless Justified
Business workflows belong in the Business Authority (Hono). They may be moved to the Trust Authority (Rust) only when there is a **compelling security, integrity, or platform-level reason** — never for convenience, performance speculation, or architectural preference. Every such move requires a documented architecture review.

*Examples of compelling reasons: cryptographic key management, financial transaction integrity that could cause irreversible loss, anti-tamper enforcement that requires native compilation.*

### P7. Every Layer Is Replaceable
The architecture is layered such that any one layer could be replaced without rewriting the others. Rust could be replaced by a Go or Zig native core. Hono could be replaced by another HTTP framework. React could be replaced by another UI framework. This is a guiding principle, not a near-term goal.

### P8. Offline-First by Default
All features work without internet connectivity. Any feature that requires connectivity must be explicitly gated and documented as such. The Rust core, Hono sidecar, and SQLite database are entirely self-contained on the user's machine.

### P9. Least Privilege for the Sidecar Process
The Hono sidecar (Node.js process) runs with the minimum necessary permissions. It executes with an **explicitly defined environment** — no inherited environment variables are trusted. The Trust Authority (Rust) controls exactly which information reaches the sidecar and through which channel. The sidecar operates as an unprivileged worker, not an authority.

### P10. The Rust Core Is the Root of Trust
If the Rust core is compromised, the entire application is compromised. All other layers assume the Rust core is honest. The Rust core is the smallest, most auditable, and most protected codebase in the system.

---

## 2. Layers & Trust Model

### 2.1 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER (untrusted)                         │
│    Keyboard, mouse, file system access, display output           │
└────────────────────────┬────────────────────────────────────────┘
                         │ user input / rendered output
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: WebView (React)              TRUST LEVEL: NONE         │
│  - Rendering, user input, desktop bridge API calls              │
│  - Never holds secrets, never makes trust decisions              │
│  - May use SubtleCrypto for non-trust utility operations         │
│  - If compromised: attacker controls UI only                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ Tauri IPC (invoke) / HTTP (to sidecar)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2.5: Tauri Shell (Rust Host)     TRUST LEVEL: PARTIAL     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Rust Core (within Tauri shell)  TRUST: FULL    │   │
│  │  - license.rs, clock.rs, update.rs (future)               │   │
│  │  - All cryptographic operations                           │   │
│  │  - Secret generation and controlled injection             │   │
│  │  - Clock tampering detection                              │   │
│  │  - This is the root of trust                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  - Process lifecycle: spawn, health-check, kill sidecar          │
│  - Window management, IPC routing, CSP enforcement              │
│  - Desktop auth bridge: bearer token held in process memory      │
│  - OS keyring access for token persistence                      │
│  - File path resolution, legacy migration                       │
│  - Note: Layer 1 and Layer 2.5 are the SAME RUST BINARY.        │
│    The separation is conceptual, not a process boundary.        │
└────────────────────────┬────────────────────────────────────────┘
                         │ spawn / env vars (write-once)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: API Sidecar (Hono / Node.js)  TRUST LEVEL: LIMITED    │
│  - Business logic, CRUD, validation, authorization              │
│  - Cannot perform crypto, cannot access license files           │
│  - Receives parsed feature flags, never raw signed license      │
│  - If compromised: can manipulate business data, but cannot     │
│    forge licenses, cannot decrypt database, cannot access keys  │
└────────────────────────┬────────────────────────────────────────┘
                         │ SQL queries
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SQLite Database                              │
│  - All business data: employees, projects, debts, inventory      │
│  - Auth tables: users, sessions, accounts                       │
│  - State files NOT stored here (Rust owns its own state files)  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer Boundaries

| Layer | Process | Language | Trust Level | If Compromised |
|-------|---------|----------|-------------|----------------|
| **Layer 1: Rust Core** | Same as Tauri Shell | Rust | **Full** | Complete compromise. All layers below are compromised. |
| **Layer 2.5: Tauri Shell** | Same as Rust Core | Rust | **Partial** (non-crypto parts) | Can control IPC, window, sidecar lifecycle. Cannot forge licenses or bypass crypto (delegates to Rust Core). |
| **Layer 2: API Sidecar** | Separate Node.js process | TypeScript (Hono) | **Limited** | Can manipulate business data. Cannot forge licenses, decrypt database, or access signing keys. |
| **Layer 3: WebView** | Tauri webview | TypeScript (React) | **None** | Can manipulate UI. Cannot access secrets or bypass feature gates. |

### 2.3 Assumptions

- The OS is trusted for process isolation (separate address spaces for Rust, Node.js, WebView).
- The filesystem is semi-trusted (Rust validates files before using them).
- The user is untrusted (may attempt to bypass licensing, tamper with files, patch code).
- Network is unavailable unless explicitly noted (offline-first).
- The Rust Core and Tauri Shell share the same address space. If an attacker gains arbitrary code execution in the Tauri Shell, they have access to the Rust Core.

---

## 3. Rust Core — Responsibilities

The Rust Core is a **conceptual** subset of the Tauri shell's Rust code. It is not a separate process, crate, or library. It is the set of modules responsible for trust, cryptography, and security-sensitive operations.

### 3.1 Current Responsibilities

| Responsibility | Description | Module |
|---------------|-------------|--------|
| **License verification** | Ed25519 signature validation, payload parsing, date checks | `license.rs` (planned) |
| **Secret generation** | 48-byte random hex for the auth secret; 32-byte random hex for the SQLCipher DB key | `lib.rs` (existing via `OsRng`) |
| **Sidecar environment provisioning** | Build a controlled, trusted environment for the sidecar — no inherited environment variables are trusted | `lib.rs` (existing, needs hardening) |
| **Sidecar process lifecycle** | Spawn, health-check, kill on exit | `lib.rs` (existing) |
| **File path resolution** | Resolve data dir, logs dir, portable mode detection | `lib.rs` (existing) |
| **Legacy migration** | Copy files from old data directories; adopt pre-#273 plaintext secret files into the OS store | `lib.rs` (existing) |
| **OS keyring access** | Store/retrieve/clear bearer tokens and runtime secrets (DPAPI / Keychain / Secret Service) | `lib.rs` (existing via `keyring`) |

### 3.2 Adjacent Responsibilities (Tauri Shell, not Rust Core)

These operations live in the same Rust binary but are architecturally part of the Tauri Shell, not the Rust Core:

| Responsibility | Description |
|---------------|-------------|
| **Desktop auth bridge** | Sign-in/sign-out/password-change with bearer token held in process memory |
| **Desktop API bridge** | Forward API requests with auth token, path whitelist validation |
| **Window management** | Tauri window config, resize, fullscreen |

*Rationale for separation:* These are IPC and process management concerns, not trust or crypto concerns. They happen to be in the same Rust binary for practical reasons (Tauri architecture), but they are architecturally separate from the Rust Core.

### 3.3 Future Responsibilities (Planned)

| Responsibility | Description | Trigger |
|---------------|-------------|---------|
| **Clock tampering detection** | Monotonic clock tracking, wall clock consistency | Licensing PRD |
| **Key rotation certificate loading** | Root CA signature verification of new public keys | Licensing PRD |
| **Grace period management** | Install timestamp file I/O, 30-day countdown | Licensing PRD |
| **Update package verification** | Ed25519 signature on update archives | Update Architecture |
| **Update package application** | Extract, replace files, run pre/post scripts | Update Architecture |
| **License enforcement (Rust-gated)** | Strip `APP_DB_KEY` if not Enterprise licensed | Licensing PRD |
| **Database encryption key management** | Accept, validate, optionally cache the DB encryption key | Licensing PRD + Security |

### 3.4 What the Rust Core Does NOT Do (and Must Never Do)

| Activity | Why Not |
|----------|---------|
| Execute business logic (employee CRUD, debt consolidation) | That's Hono's job. Rust has no concept of an "employee" or "warehouse." |
| Connect to the SQLite database directly | Database access is Hono's responsibility. Rust reads/writes only its own state files. |
| Serve HTTP requests | The Hono sidecar serves HTTP. Rust communicates via environment variables and Tauri IPC. |
| Render UI | The WebView renders UI. Rust exposes Tauri commands for the frontend to call. |
| Validate user input (phone numbers, names, amounts) | That's the Hono API + Zod contracts. Rust validates only license payloads and cryptographic signatures. |
| Store or cache business data | All business data lives in SQLite, accessed by Hono. Rust stores only its own runtime state files. |
| Make network requests to external services | The app is offline-first. Future update checks may use `reqwest` for download only. |
| Hold bearer tokens for the user's session | That's the Tauri shell's desktop auth bridge. The Rust Core (conceptual) does not manage tokens. |

---

## 4. Hono (TypeScript API Sidecar) — Responsibilities

### 4.1 Current Responsibilities

| Responsibility | Description |
|---------------|-------------|
| **HTTP server** | Serve API endpoints on `127.0.0.1:4318` |
| **Business logic** | All domain services: Company, Inventory, Invoice, Payment, Workforce, etc. |
| **CRUD operations** | Create, read, update, delete for all entities |
| **Input validation** | Zod schemas in `packages/contracts`, double-validation in middleware |
| **Authentication** | Better Auth integration: phone sign-in, bearer tokens, sessions |
| **Authorization** | RBAC middleware: permission checks on every mutation |
| **Audit logging** | Event sourcing via history tables, system log builder |
| **Database access** | SQLite via Drizzle ORM (auth tables) and better-sqlite3 (business tables) |
| **File management** | Invoice attachment storage/retrieval (filesystem I/O) |
| **Reporting** | Report handlers, data aggregation |
| **oRPC transport** | Typed RPC layer for all business operations |
| **Rate limiting** | Sliding window rate limiter (in-memory) |

### 4.2 What Hono Must Never Do

| Activity | Why Not |
|----------|---------|
| Verify cryptographic signatures | That's Rust's responsibility. Hono never imports Ed25519, SHA-256, or any crypto for trust decisions. |
| Read or write `license.lic` | The license file belongs to Rust. Hono receives only parsed feature flags via env vars. |
| Read or write the `better-auth.secret` | Rust generates and injects this. Hono reads it from `BETTER_AUTH_SECRET` env var. |
| Read or write database encryption keys | Rust controls whether `APP_DB_KEY` reaches Hono. Hono never stores or generates encryption keys. |
| Make network requests to external services | The app is offline-first. If future features require network (update checks), they go through Rust, not Hono. |
| Perform filesystem I/O outside its designated paths | Hono writes only to `logs/api-server.log` and the attachments directory. |
| Modify its own runtime code | The API sidecar should be immutable at runtime. No self-modification, no dynamic code loading. |

---

## 5. React Frontend — Responsibilities

### 5.1 Current Responsibilities

| Responsibility | Description |
|---------------|-------------|
| **UI rendering** | All React components: pages, forms, tables, charts, dialogs |
| **Routing** | TanStack Router for page navigation |
| **Server state management** | TanStack Query for caching, invalidation, optimistic updates |
| **User input handling** | Form state, validation feedback, file selection |
| **API calls** | oRPC client via direct fetch (browser) or desktop bridge (Tauri) |
| **Internationalization** | i18next for Arabic/English, LTR/RTL layout |
| **Desktop integration** | Runtime config, desktop bridge detection, auth bridge calls |
| **Theme management** | Light/dark mode, preference persistence |
| **Error display** | Toast notifications, error boundaries, loading states |

### 5.2 What the Frontend Must Never Do

| Activity | Why Not |
|----------|---------|
| Validate feature gates as enforcement | Feature visibility in UI is for UX only. Real enforcement is in Hono and Rust. |
| Store bearer tokens in localStorage/IndexedDB | Tokens live in Rust process memory (desktop) or HTTP-only cookies (browser). |
| Perform trust-deciding cryptographic operations | No Ed25519, no key generation, no signature verification for trust purposes. |
| Read or write license files | Only Rust reads/writes `license.lic`. |
| Access the SQLite database | Database access is Hono's responsibility. |
| Bypass the API for trust decisions | Every business operation must go through the API. No optimistic trust of client-side state. |

---

## 6. Rust Core vs Tauri Adapter — Two Distinct Layers

The Rust codebase is divided into **two architecturally distinct layers** that share the same compilation unit but have very different responsibilities and dependencies.

### 6.1 Rust Core (Platform Library)

The **Rust Core** is a pure platform library. It must contain **no Tauri types, no Tauri imports, no desktop-specific APIs**. It compiles independently of Tauri and can be used in non-Tauri contexts (CLI tools, testing harnesses, maintenance utilities, migration tools).

| Module | Responsibility | Tauri Dependency |
|--------|---------------|------------------|
| `license.rs` | Licensing, Ed25519 verification, key rotation, grace period | ❌ None |
| `clock.rs` | Monotonic clock tracking, tamper detection | ❌ None |
| `crypto.rs` (future) | Shared cryptographic utilities | ❌ None |
| `update.rs` (future) | Update package verification | ❌ None |

The Rust Core:
- Exposes plain Rust functions and structs.
- Returns `Result<T, RustCoreError>` (no Tauri error types).
- Can be tested with `cargo test` without any Tauri harness.
- Can be packaged as a standalone `rlib` or `cdylib` for other consumers.

### 6.2 Tauri Adapter (Desktop Bindings)

The **Tauri Adapter** is the layer that bridges the Rust Core to the Tauri desktop environment. It imports Tauri types, registers Tauri commands, and manages the desktop lifecycle. This is the only layer that depends on `tauri::`.

| Component | Responsibility | Depends On |
|-----------|---------------|------------|
| `lib.rs` — Tauri command handlers | `#[tauri::command]` functions, IPC routing, auth bridge | Rust Core, Tauri SDK |
| `lib.rs` — setup hook | Sidecar spawning, window configuration, runtime file resolution | Rust Core, Tauri SDK |
| `lib.rs` — run loop | Event handling (exit, window close) | Tauri SDK |
| `main.rs` | Entrypoint, `windows_subsystem` attribute | Tauri SDK |

### 6.3 Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Desktop Host (app_lib binary)                │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Tauri Adapter                            │  │
│  │  - lib.rs (Tauri commands, setup, IPC)             │  │
│  │  - main.rs (entrypoint)                            │  │
│  │  - Depends on: tauri SDK, Rust Core                │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │ function calls (same process)    │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │           Rust Core (Platform Library)              │  │
│  │  - license.rs, clock.rs, crypto.rs, update.rs      │  │
│  │  - Depends on: ed25519-dalek, base64, chrono       │  │
│  │  - NO dependencies on: tauri, webview, OS APIs     │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  Shared address space, same crate.                       │
│  Architecturally distinct.                               │
└─────────────────────────────────────────────────────────┘
```

### 6.4 Future Consumers of the Rust Core

Because the Rust Core has no Tauri dependency, it can serve:

| Consumer | Example |
|----------|---------|
| **Desktop application** | Current Tauri host (via Tauri Adapter) |
| **CLI tool** | `tuari license generate`, `tuari db check` |
| **Maintenance utility** | `tuari migrate`, `tuari repair` |
| **Testing harness** | `cargo test --package tuari-core` |
| **CI pipeline** | License file validation in CI |

### 6.5 Responsibility Split

The original "Tauri Shell" concept is now split across three layers:

| Responsibility | Owner |
|---------------|-------|
| License verification | Rust Core (`license.rs`) |
| Secret generation | Rust Core (`crypto.rs`) |
| Secret injection into sidecar | Tauri Adapter (calls Rust Core, sets env) |
| Sidecar lifecycle (spawn, health-check, kill) | Tauri Adapter |
| Window management | Tauri config |
| IPC routing / Tauri commands | Tauri Adapter |
| CSP enforcement | Tauri config |
| Resource bundling | Tauri config (tauri.conf.json) |
| Portable mode detection | Tauri Adapter |
| Legacy file migration | Tauri Adapter |
| File path resolution | Tauri Adapter (calls Rust Core helpers) |
| OS keyring access | Tauri Adapter |

---

## 7. Trust Authority Public Contract

Rust provides a set of **logical services** to the rest of the application. These services define the architectural contract between the Trust Authority and all other layers. The **what** is documented here. The **how** (environment variables, IPC, shared memory, sockets) is an implementation detail that may change over time.

### 7.1 License Service

| Method | Returns | Description | Consumer |
|--------|---------|-------------|----------|
| `edition()` | `{ id: string, name: string }` | Current license edition | Hono, Frontend |
| `status()` | `{ state: 'active' \| 'trial' \| 'expired' \| 'grace', daysRemaining: number }` | License validity state | Hono, Frontend |
| `hasFeature(feature)` | `boolean` | Whether a specific feature is licensed | Hono |
| `customer()` | `{ name: string, email: string } \| null` | Licensed customer identity | Frontend (display only) |
| `limits()` | `{ maxUsers: number }` | Usage limits from the license | Hono |
| `expiresAt()` | `DateTime \| null` | License expiry (null = perpetual) | Hono, Frontend |
| `activate(content)` | `{ success: boolean, edition?: string, error?: string }` | Activate a new license file | Frontend (via Tauri command) |

### 7.2 Secret Service

| Method | Returns | Description | Consumer |
|--------|---------|-------------|----------|
| `injectBetterAuthSecret()` | `string` | Generate and provide the auth signing secret | Hono (via environment) |
| `filterDatabaseKey(license)` | `string \| null` | Provide DB encryption key only if licensed | Hono (via environment) |

### 7.3 Runtime Service

| Method | Returns | Description | Consumer |
|--------|---------|-------------|----------|
| `resolveRuntimeConfig()` | `{ apiUrl, dataDir, logsDir, ... }` | Resolve file paths for the runtime | Frontend (via Tauri command) |
| `sidecarEnvironment(license)` | `HashMap<String, String>` | Build the controlled environment for the sidecar | Tauri shell (internal) |
| `healthCheck()` | `boolean` | Verify the sidecar is responsive | Tauri shell (internal) |

### 7.4 Identity Service (Tauri Shell, not Rust Core)

| Method | Returns | Description | Consumer |
|--------|---------|-------------|----------|
| `signIn(phone, password)` | `{ success: boolean }` | Authenticate and store bearer token in process memory | Frontend (via Tauri command) |
| `signOut()` | `void` | Clear bearer token, invalidate server session | Frontend (via Tauri command) |
| `changePassword(current, new)` | `{ success: boolean }` | Rotate password, update stored token | Frontend (via Tauri command) |
| `apiRequest(method, path, body)` | `Response` | Forward authenticated API request | Frontend (via Tauri command) |

*Note: The Identity Service is part of the Tauri Adapter, not the Rust Core. It is listed here because it is exposed through the same desktop-facing boundary.*

### 7.5 Architectural Contract

These service interfaces constitute the **stable contract** between the Trust Authority and all consumers. The following rules apply:

1. **Semantic versioning.** Changes to service methods or return types require a major version bump.
2. **Backward compatibility.** New methods may be added; existing methods must not be removed without a deprecation period.
3. **Transport independence.** The architecture does not specify how these services are transported (environment variables, IPC, shared memory). The implementation may change without changing the contract.
4. **Consumer transparency.** Consumers do not know whether a service is backed by a file read, a computation, or a network call.

### 7.6 Current Implementation Notes (Not Architecture)

*The following notes document the current implementation choices. They are not part of the architectural contract and may change.*

- The License Service is currently implemented via **structured environment variables** (`TUARI_LICENSE_EDITION`, `TUARI_LICENSE_FEATURES`, etc.) set at sidecar startup.
- The Identity Service is implemented via **Tauri IPC commands** (`desktop_sign_in_with_phone_number`, `desktop_api_request`, etc.).
- The Secret Service injects secrets into the sidecar environment. The sidecar must execute with an **explicitly defined environment** — no inherited environment variables are trusted.

### 7.7 State Files (Trust Authority Only)

| File | Location | Purpose |
|------|----------|---------|
| `license.lic` | `<app_data>/Tuari/` | Signed license file |
| `key-rotation-*.json` | `<app_data>/Tuari/` | Key rotation certificates |
| `better-auth.secret` | OS credential store (`com.tuari.desktop.secrets`); owner-only `<app_data>/runtime/secrets/` fallback only when the OS store is unavailable | Auth signing secret (injected via `BETTER_AUTH_SECRET`) |
| `app-db.key` | OS credential store (`com.tuari.desktop.secrets`); owner-only fallback file | SQLCipher database key (injected via `APP_DB_KEY`) |
| `clock-tracker.json` | `<app_data>/Tuari/` | Clock high-water mark (resettable) |
| `install-anchor.json` | `<app_data>/Tuari/` | Durable trial install anchor |

---

## 8. Cross-Layer Communication Patterns

### 8.1 Layer Communication Matrix

| From ↓ To → | WebView | Tauri Shell | Rust Core | Hono Sidecar | Database |
|-------------|---------|-------------|-----------|--------------|----------|
| **WebView** | — | Tauri IPC (invoke) | ❌ (no direct access) | HTTP via Identity Service | ❌ |
| **Tauri Shell** | WebView (load URL) | — | Function calls (same process) | Spawn + data channel + kill | ❌ |
| **Rust Core** | ✅ (via Tauri Shell: services) | Function calls (same process) | — | License + Secret services (via data channel) | State files only |
| **Hono Sidecar** | ❌ | ❌ | ⚠️ (future: direct IPC channel) | — | SQL queries |
| **Database** | ❌ | ❌ | ❌ | SQL queries | — |

### 8.2 Communication Rules

1. **WebView → Trust Authority (Rust)**: Through named Tauri commands only. No arbitrary Rust code execution from the WebView.

2. **WebView → Business Authority (Hono)**: Through the Identity Service (desktop bridge in desktop mode, direct `fetch()` in browser dev mode). The desktop bridge validates paths and injects auth tokens.

3. **Trust Authority → Business Authority**: Through the License and Secret services. Current implementation uses a data channel (environment variables) established at sidecar startup. No runtime IPC channel during normal operation.

4. **Business Authority → Database**: SQL queries. Hono is the sole database client. The Trust Authority does not access the database.

5. **Business Authority → Trust Authority**: ⚠️ **Not directly supported for runtime calls.** If a future feature requires Hono to request a Rust operation, a **direct IPC channel** (Unix domain socket or Windows named pipe) should be added. Routing trust operations through the Presentation Authority (WebView) is **expressly forbidden**.

### 8.3 Why No Rust ↔ Hono Runtime IPC (Yet)

The current design deliberately avoids a runtime IPC channel between Rust and Hono:

- **Simplicity**: Environment variables at startup cover all current needs.
- **Security**: Runtime communication creates a larger attack surface.
- **Decoupling**: Rust can evolve independently as long as the env var contract is maintained.
- **When to add it**: If a concrete need arises (e.g., real-time license revocation, dynamic feature flags, update verification during runtime), a direct channel will be added. The decision is deferred until needed (YAGNI).

### 8.4 One-Way Communication Principle

```
Rust Core ──env vars (startup)──→ Hono Sidecar
Rust Core ──Tauri commands─────→ WebView
WebView ────desktop bridge─────→ Hono Sidecar
Hono Sidecar ──SQL queries─────→ Database

(NO DIRECT PATH from Hono → Rust Core)
(NO DIRECT PATH from WebView → Rust Core except named commands)
```

---

## 9. What Must Never Leave Rust

These operations are permanently assigned to Rust. They must never be moved to TypeScript (Hono or React).

### 9.1 Cryptographic Operations

| Operation | Reason |
|-----------|--------|
| Ed25519 signature verification | Root of trust for licensing and updates |
| SHA-256 hashing for integrity checks | Used for update package and file verification |
| Random secret generation (`OsRng`) | Used for `better-auth.secret` and license nonces |
| Public key management and storage | Rust binary holds the embedded public key |

### 9.2 Trust Decisions

| Decision | Reason |
|----------|--------|
| "Is this license valid?" | Must be signature-verified before any feature is gated |
| "Is this update package authentic?" | Must be signature-verified before extraction |
| "Has the system clock been tampered with?" | Must use guaranteed monotonic time (`std::time::Instant`) |
| "Should this license edition enable this feature?" | Feature list must come from verified license |
| "Is this a fresh install or a reinstall?" | Install-timestamp management |

### 9.3 Secret Storage and Injection

| Operation | Reason |
|-----------|--------|
| Better Auth secret generation and injection | Secret is the root key for all auth tokens |
| Database encryption key acceptance and filtering | Rust decides whether `APP_DB_KEY` reaches the sidecar |
| OS keyring read/write | Bearer token persistence (managed by Tauri shell, using Rust Core crypto) |

---

## 10. What Must Remain in Hono

These operations are permanently assigned to Hono. They must never move to Rust.

### 10.1 Business Domain Logic

| Domain | Reason |
|--------|--------|
| Employee lifecycle (CRUD, state transitions, salary) | Complex business rules, database-backed, rapidly evolving |
| Project/warehouse management | Same reasons |
| Debt ledger (entries, payments, consolidation) | Running-balance calculations, audit history, database transactions |
| Inventory (receiving, transferring, outbound) | Location tracking, quantity management, filesystem I/O |
| Invoice and payment processing | Multi-entity financial transactions |
| Any future domain-specific feature | All new business features start in Hono |

### 10.2 Authorization and Access Control

| Responsibility | Reason |
|---------------|--------|
| RBAC permission evaluation | Queries `role_permission` junction table, requires database access |
| Session management | Better Auth integration, session CRUD in database |
| Rate limiting | Current in-memory implementation |

### 10.3 Data Access

| Responsibility | Reason |
|---------------|--------|
| All SQLite queries (business + auth) | Rust does not access the database |
| Schema migrations | Drizzle Kit or equivalent tool |
| ORM operations (Drizzle) | Auth tables via Drizzle adapter |
| File attachment storage | Filesystem I/O for invoice attachments |

### 10.4 API Transport

| Responsibility | Reason |
|---------------|--------|
| HTTP server (Hono) | Request routing, middleware, response formatting |
| oRPC contract handling | Type-safe RPC between frontend and API |
| CORS, security headers | Transport-layer security |
| Input validation (Zod) | Schema-based validation for all API inputs |

---

## 11. What Belongs in the Frontend

### 11.1 UI and Interaction

| Responsibility | Reason |
|---------------|--------|
| All React components | Pages, forms, tables, charts, dialogs |
| Client-side routing | TanStack Router for navigation |
| Form state management | Controlled inputs, validation feedback |
| Localization (i18n) | Arabic/English switching, RTL layout |
| Theme management | Light/dark mode, preference persistence |
| Animation and transitions | UX polish, loading states |

### 11.2 Client-Side State

| Responsibility | Reason |
|---------------|--------|
| TanStack Query cache | Server state caching, invalidation, optimistic updates |
| URL state (search params, filters) | TanStack Router |
| UI preferences (sidebar state, column visibility) | Local component state or preferences |
| Form draft state | Unsaved changes, field-level validation |

### 11.3 Desktop Integration (via Tauri IPC)

| Responsibility | Reason |
|---------------|--------|
| Runtime config retrieval | API URL, paths (via `get_runtime_config`) |
| Auth operations | Sign-in, sign-out, password change (via desktop bridge) |
| API calls | Through `desktop_api_request` for authenticated requests |
| License activation UI | File picker, display status (via `activate_license`, `get_license_status`) |

---

## 12. Security-Critical Modules

### 12.1 Critical (Rust Core — requires highest review + audit)

| Module | Risk if Compromised | Enforcement Type | Mitigation |
|--------|---------------------|-----------------|------------|
| `license.rs` — signature verification | Forged license accepted | Rust-enforced (cannot bypass from JS) | Multiple reviewers, unit tests for positive/negative cases, property-based testing on parse |
| `license.rs` — public key storage | Key replaced | Rust-enforced | Key embedded at build time, CI verifies checksum |
| `license.rs` — grace period logic | Infinite trial | Rust-enforced | Test coverage for boundary conditions |
| `clock.rs` — tamper detection | Clock check bypassed | Rust-enforced | Test clock manipulation scenarios |
| `lib.rs` — env var provisioning | Secret leaked to sidecar | Rust-enforced | Sidecar environment must be explicitly defined, not inherited. Code review. |
| `lib.rs` — `OsRng` secret generation | Weak/cached randomness | Rust-enforced | Use OS entropy (no CSPRNG seeding concerns) |

### 12.2 Important (Hono — requires thorough review)

| Module | Risk if Compromised | Enforcement Type | Mitigation |
|--------|---------------------|-----------------|------------|
| `auth.ts` — Better Auth config | Auth bypass | API-enforced | Keep configuration minimal, pin library version |
| `rpc-middleware.ts` — permission checks | Unauthorized access | API-enforced (cannot be bypassed from frontend, but can be bypassed by patching sidecar) | Unit tests for every permission check |
| `license.ts` — feature gate middleware | Feature bypass | API-enforced (see note) | Integration tests for gate enforcement; Rust-enforced for encrypted DB as backup |
| `schema.ts` — database migrations | Data loss | — (migration quality) | Test migrations on copy of production data |

*Note on API-enforced vs Rust-enforced:* API-enforced gates can be bypassed by a skilled attacker who patches the Node.js sidecar. The defense-in-depth strategy ensures that high-value gates (encrypted database) have a Rust-enforced backup. Business-logic gates (reports, sync) are API-enforced, which is acceptable because the cost of bypassing them exceeds the value obtained.

### 12.3 Moderate (Frontend — standard review)

| Module | Risk if Compromised |
|--------|---------------------|
| `desktop-api-bridge.ts` — IPC communication | Attacker could inject API calls (mitigated by path whitelist in Rust) |
| `auth-api.ts` — auth flow | UI-level issues only; real auth is server-side |

---

## 13. Performance-Critical Modules

### 13.1 Current Hot Paths

| Module | Why Critical | Current Profile |
|--------|-------------|-----------------|
| `database/factory.ts` — SQLite connection | Created once, used for all queries | ~10ms startup |
| `schema.ts` — migrations | Runs on every startup | ~100ms-2s depending on migration count |
| `company.repository.ts` — snapshot queries | 15 sub-queries for workspace load | ~50-200ms |
| `debt_account` queries | Running balance calculation | Single-row updates, fast |
| `inventory` movements | Location tracking queries | Indexed queries |

### 13.2 Future Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| Synchronous better-sqlite3 blocks event loop | Move heavy queries to a worker thread or use `libsql` (async) |
| Workspace snapshot (15 queries) | Consider caching the snapshot or using a materialized view |
| Migration system recreates tables | Replace with proper migration tool (Drizzle Kit) |
| License validation on startup | Sub-millisecond Ed25519 verification — negligible |

---

## 14. Intellectual Property — Strategic Business Assets

This section identifies the components that constitute the company's most valuable intellectual property. These deserve the highest level of architectural protection, code review scrutiny, and — where justified — native code compilation.

### 14.1 Strategic Business Assets (Business Authority — Hono)

These are the domain-specific algorithms and data models that differentiate the product. They are currently in TypeScript, which provides rapid iteration. If they become targets for reverse-engineering or bypass, they may be candidates for Rust migration (see Decision Framework, Section 15).

| Asset | Description | Strategic Value |
|-------|-------------|----------------|
| **Debt / Accounting Engine** | Dual-direction accounting with running balances, consolidation, voiding, reason-category-driven direction locking | **Highest** — core financial IP, double-entry-adjacent accounting |
| **Employee Lifecycle Engine** | Batch creation with cross-field validation, state transition rules, salary management, manager/project/warehouse assignment | **High** — workforce management is the primary product use case |
| **Inventory Engine** | Dual-model (consumable + asset) inventory, location tracking, movement chains, invoice-driven debt creation | **High** — supply chain tracking |
| **Reconciliation Engine** | Debt consolidation (netting opposite OPENING entries), payment-to-invoice matching | **High** — financial close processes |
| **Reporting Engine** | Aggregated views, audit log builder, workspace snapshot | **Medium** — depends on data quality from other engines |
| **Future: Sync Engine** | Multi-site data synchronization protocol | **High** — Enterprise differentiator |

### 14.2 Strategic Business Assets (Trust Authority — Rust)

These are the compiled native modules that protect the business assets above:

| Module | Description | Protection |
|--------|-------------|------------|
| `license.rs` | Ed25519 license verification, offline activation protocol, key rotation, grace period management | **Highest** — compiled binary, stripped symbols, LTO |
| `clock.rs` | Monotonic clock-based tamper detection | Compiled native code |

### 14.3 Rust as a Reusable Platform (Not Tauri-Coupled)

The Trust Authority (Rust) is designed as a **reusable platform component**, not a module tied to the Tauri desktop application. The same Rust codebase can serve:

- **Desktop application** (current Tauri host)
- **CLI tools** (license generation, database maintenance, diagnostics)
- **Maintenance utilities** (data migration, cleanup, repair)
- **Migration tools** (schema upgrades, data transformation)
- **Internal testing tools** (integration test harnesses, fuzzing)

To preserve this reusability:
- The Rust Core must not import Tauri types directly (no `tauri::` in `license.rs` or `clock.rs`).
- The Rust Core exposes plain Rust functions and structs. Tauri integration happens in `lib.rs` (the shell), not the core.
- The Rust Core has its own `Cargo.toml` characteristics (no Tauri dependency in core modules).

### 14.4 IP Protection Strategy

| Layer | Protection | Notes |
|-------|-----------|-------|
| **Business logic (TypeScript)** | Legal (license agreement, DMCA) | JS code is inherently readable. The value is in the domain knowledge, not code obscurity. Strategic assets (Section 14.1) may be candidates for Rust compilation. |
| **Rust Core** | Compiled binary, stripped symbols, LTO | Significantly harder to reverse-engineer than JS. `license.rs` is the most protection-worthy Rust module. |
| **Database schema** | Not publicly documented | The schema embodies domain design decisions. |
| **Testing strategies** | Internal | The test suite encodes edge cases discovered during development. |

### 14.5 Asset Tier Classification

Strategic assets are classified into tiers to guide protection investment:

| Tier | Assets | Protection Level | Example |
|------|--------|-----------------|---------|
| **Tier 1 — Critical** | Licensing system, cryptographic keys, accounting engine, debt engine | **Highest.** Rust-enforced gates, compiled native code, strictest review. Financial logic errors could cause irreversible loss. | `license.rs`, `debt_account.rs`, key management |
| **Tier 2 — Important** | Synchronization protocol, reporting engine, inventory calculations | **High.** Standard Rust/TypeScript boundaries apply. Review focuses on correctness and data integrity. | `inventory/`, `reporting/` |
| **Tier 3 — Standard** | UI, CRUD forms, user preferences, theme management | **Standard.** TypeScript in Presentation Authority. Standard code review applies. | React components, form validation |

This classification informs:
- **Review depth:** Tier 1 requires two-reviewer + security team sign-off. Tier 2 requires standard review. Tier 3 requires standard review.
- **Test coverage:** Tier 1 requires >95% coverage including property-based tests. Tier 2 requires >85%. Tier 3 requires >70%.
- **Migration priority:** If a decision is made to move code from TypeScript to Rust, Tier 1 assets are candidates first.

---

## 15. Decision Framework: Rust vs TypeScript

### 15.1 Decision Tree

When evaluating whether a new feature or module belongs in Rust or TypeScript, apply this decision tree in order:

```
Does the feature involve trust-deciding cryptographic operations?
  ├── Yes → Rust
  └── No → ↓

Does the feature make trust decisions (license validity, update authenticity)?
  ├── Yes → Rust
  └── No → ↓

Does the feature require guaranteed monotonic time for tamper detection?
  ├── Yes → Rust (std::time::Instant is guaranteed monotonic)
  └── No → ↓

Does the feature store or manage secrets that other layers should not access?
  ├── Yes → Rust
  └── No → ↓

Does the feature involve business logic, CRUD, or database queries?
  ├── Yes → Hono (TypeScript)
  └── No → ↓

Does the feature involve UI rendering, user input, or client-side state?
  ├── Yes → React (TypeScript)
  └── No → ↓

If none of the above apply: prefer Hono (TypeScript) for new features.
Move to Rust only if profiling demonstrates a measurable need.
```

### 15.2 Tiebreaker Rules

| Scenario | Decision |
|----------|----------|
| Feature could work in either layer | **Prefer TypeScript.** Development speed matters. |
| Security-sensitive subcomponent within a business feature | **Extract the subcomponent to Rust** if possible (e.g., "verify checksum" in Rust; "process the file" in TypeScript). |
| Performance-critical hot path (identified by profiling) | **Move to Rust** with a clear before/after benchmark. |
| Intellectual property that justifies compilation | **Consider Rust** if the IP value justifies the engineering cost. |

### 15.3 Default Positions

| Layer | Default For |
|-------|-------------|
| **Rust** | Cryptography, trust, secrets, integrity, process lifecycle, file system security |
| **Hono (TypeScript)** | Business logic, CRUD, validation, reporting, API transport, database access |
| **React (TypeScript)** | UI, client state, desktop integration commands |

---

## 16. Preventing Duplicate Implementations

### 16.1 The Duplication Risk

Without discipline, business rules can end up duplicated across layers. The key insight: **duplication for different purposes is acceptable; duplication for the same purpose is technical debt.**

### 16.2 Rules

| Rule | Example |
|------|---------|
| **Business rules have one authoritative location: Hono services.** Frontend may duplicate for UX feedback but must defer to Hono for enforcement. | Frontend shows "Phone required" on blur; Hono returns 400 if missing. |
| **Authorization lives in Hono RPC middleware.** Frontend may hide buttons for UX but must not gate API calls. | Frontend hides "Delete" button; Hono returns 403 if lacking permission. |
| **Feature gating lives in Hono middleware (API-enforced) with Rust backup for critical features.** Frontend may show/hide UI elements. | Frontend shows "Server Settings" only if `availableFeatures` includes `lan_server`; Hono rejects if unlicensed; Rust strips `APP_DB_KEY` if unlicensed. |
| **Validation for different purposes is allowed.** | Frontend validates for UX (instant feedback); Hono validates for data integrity (before DB write). |
| **Data transformation should happen in exactly one layer.** | Date formatting: Hono returns ISO strings; frontend formats for display. Not both. |
| **If a rule appears in two layers, document which is authoritative.** | The authoritative layer is the one closer to the data. Hono > frontend. Rust > Hono. |

### 16.3 Code Review Checklist

For every pull request, reviewers must check:
- [ ] Is this business rule duplicated?
- [ ] If duplicated, is it intentional (different purposes)?
- [ ] If intentional, is the authoritative layer documented?
- [ ] Could this be enforced in a single layer instead?

---

## 17. Error Handling Philosophy

### 17.1 Rust Core Errors

- All Rust Core functions return `Result<T, RustCoreError>`. They never panic in production code paths.
- `RustCoreError` is an enum with variants: `InvalidSignature`, `Expired`, `ClockTampered`, `LicenseFileNotFound`, `IoError`, etc.
- The Tauri shell (caller) maps `RustCoreError` to user-facing error messages and appropriate HTTP/command responses.
- In debug builds, panics may provide additional context. In release builds, panics are caught by `std::panic::catch_unwind` in the Tauri command handlers.

### 17.2 Hono Errors

- Hono uses `ORPCError` for RPC-layer errors and domain-specific error classes (`CompanyError`, `InventoryError`, `AccountServiceError`).
- All errors are mapped to user-facing Arabic messages.
- A future improvement should standardize on a single `AppError` type.

### 17.3 Frontend Errors

- Error boundaries catch React rendering errors.
- TanStack Query's `onError` handles API errors.
- All user-facing errors are displayed as toast notifications (via `sonner`).

---

## 18. Five-Year Evolution Path

This section explicitly maps the architecture's evolution across deployment modes. The principle: **the same architecture serves all modes** — only the deployment configuration and license change.

| Year | Primary Deployment | User Scale | Data Model | Connectivity |
|------|-------------------|------------|------------|--------------|
| 1 | **Desktop** (single-user) | 1 user | Local SQLite | Offline |
| 2 | **Internal Server** (LAN multi-user) | 2-50 users | Shared SQLite (network file or dedicated server) | LAN |
| 3 | **Remote Administration** (managed) | 10-200 users | Centralized database | VPN / private network |
| 4 | **Cloud Sync** (distributed) | 50-5000 users | Local + cloud (hybrid) | Periodic online sync |
| 5 | **Hybrid Deployment** (all of the above) | 100+ users | Configurable per tenant | Offline-first with sync |

### 18.1 Year 1 — Desktop (Current — 2026)

| Focus | Actions |
|-------|---------|
| **Rust Core foundation** | License verification, clock tracking, controlled sidecar environment, sidecar lifecycle |
| **Hono stability** | Complete business features, test coverage, remove dual data-access layer |
| **Frontend maturity** | Feature parity, RTL/Arabic, accessibility, responsive layout |
| **No Rust business logic** | Keep Rust scope minimal. No business domain code in Rust. |
| **Separation established** | Rust Core has zero Tauri dependencies. Tauri Adapter is the only Tauri-aware layer. |

**What this proves:** The architecture works for a single-user, fully offline desktop ERP. The three-authority model is validated in production.

### 18.2 Year 2 — Internal Server

| Focus | Actions |
|-------|---------|
| **Rust Core expansion** | Update verification, package signing, secure download |
| **Performance** | Profile hot paths; consider worker threads for heavy SQLite queries |
| **IP hardening** | Evaluate moving the debt accounting engine to Rust if it becomes a bypass target |
| **Server mode** | LAN server feature — the Hono sidecar binds to a LAN address instead of localhost. The Business Authority runs as a standalone server. The Rust Core remains local (desktop only). License gating controls access. |

**What changes:** The Business Authority (Hono) can run as a standalone process on a LAN server. The Trust Authority (Rust) remains in the desktop client for licensing. The service interface (Section 7) must accommodate this — the desktop client sends its license status to the server.

**What does NOT change:** The three-authority model. The service interfaces. The Rust Core's zero-Tauri-dependency constraint.

### 18.3 Year 3 — Remote Administration

| Focus | Actions |
|-------|---------|
| **Runtime IPC** | Evaluate adding a Unix socket / named pipe for Rust ↔ Hono runtime communication |
| **Multi-site sync** | Sync protocol (Hono business logic, Rust integrity verification) |
| **Plugin system** | Consider WebAssembly-based plugin API (sandboxed in Rust) |
| **Remote management** | Admin interface for monitoring, configuration, and user management across multiple sites |

**What changes:** The Trust Authority may now be remote (license server validates licenses centrally). The Business Authority may be replicated across sites. The sync engine (new) coordinates data between sites, with Rust verifying sync package integrity.

### 18.4 Year 4-5 — Cloud & Hybrid

| Focus | Actions |
|-------|---------|
| **Full native evaluation** | Evaluate whether the entire service layer should move to Rust for a next-gen version. TypeScript becomes the "rapid prototyping" layer; Rust becomes the "production" layer. |
| **Cloud hybrid** | If cloud sync is added, Rust owns end-to-end encryption. Hono owns sync orchestration. |
| **Architecture refresh** | Audit all architectural principles. Revise any that no longer serve the project. |
| **Cloud deployment** | The Business Authority can be deployed as a cloud service (containerized Hono app). The Trust Authority remains in the desktop client; a cloud Trust Authority may be added for centralized license management. |

**What proves the architecture:** The same three-authority model that started on a single desktop now spans desktop clients, LAN servers, and cloud services — without rewriting any authority.

### 18.5 Boundaries That Should NOT Change

| Boundary | Permanence |
|----------|-----------|
| Crypto in Rust | **Permanent** — this is a security invariant |
| Business logic in Hono | **Permanent** — unless the entire service layer migrates to Rust (year 4-5 evaluation) |
| Two-layer feature gating | **Permanent** — defense-in-depth |
| Frontend has no trust authority | **Permanent** — this is a security invariant |
| Rust Core has no Tauri dependency | **Permanent** — enables CLI, testing, and future consumers |

---

## 19. Architecture Decision Record

### ADR-RCA-001 — Rust as the Trusted Computing Base

**Status:** Accepted
**Date:** 2026-06-30

#### Context

The Tuari application operates in a hostile environment: the user's machine. The user may attempt to bypass licensing, tamper with files, patch code, or reverse-engineer the application. The application needs a root of trust — a component that cannot be modified by the user without significant effort.

Three options were considered for the Trusted Computing Base:

| Option | Description | Trust Level | Bypass Difficulty |
|--------|-------------|-------------|-------------------|
| **TypeScript (Hono sidecar)** | License verification, crypto, and secrets in the Node.js API process | Low — JS is readable and patchable | Trivial — edit `dist/index.cjs` |
| **Rust + TypeScript hybrid** | Crypto in Rust, business logic in TypeScript (current choice) | High — crypto operations require native RE | Hard — requires Rust binary patching |
| **Everything in Rust** | All logic including business workflows in a native binary | Very high | Very hard — but eliminates the iteration speed of TypeScript |

#### Decision

**Option 2: Rust + TypeScript hybrid, with Rust as the Trusted Computing Base.**

Specifically:
- **Trust Authority (Rust):** All cryptographic operations, secret management, license verification, update verification, and integrity checks execute in compiled Rust code. The Rust code is stripped, LTO-optimized, and embedded in the Tauri binary.
- **Business Authority (Hono/TypeScript):** All business logic, CRUD, validation, reporting, and data access execute in TypeScript on Node.js. This provides rapid iteration and broad ecosystem access.
- **Presentation Authority (React/TypeScript):** All UI rendering and user interaction execute in the WebView.

The Trust Authority is the smallest, most auditable, and most protected codebase in the system. It communicates with the Business Authority through a well-defined service interface (Section 7), never exposing the raw cryptographic artifacts.

#### Rationale

1. **Crypto belongs in Rust.** Ed25519, SHA-256, and key management are well-established in the Rust ecosystem with audited libraries (`ed25519-dalek`, `ring`). Implementing them in TypeScript would rely on pure-JS crypto implementations that are slower and less audited.

2. **Secrets remain inaccessible.** The Better Auth secret, database encryption key, and signing keys are generated, stored, and injected by Rust. The Node.js process never has access to the raw secret material source.

3. **License verification cannot be bypassed from JS.** Forging a license requires either (a) the Ed25519 private key (air-gapped HSM) or (b) reverse-engineering the Rust binary to replace the public key. Both are significantly harder than patching a TypeScript file.

4. **Business logic stays fast to iterate.** ERP business rules are complex, change frequently, and benefit from TypeScript's rapid edit-reload cycle. Moving them to Rust would slow development without commensurate security benefit.

5. **The Rust Core is reusable.** By keeping Tauri types out of the core modules, the same Rust code can serve CLI tools, maintenance utilities, and future platform targets.

#### Consequences

**Positive:**
- The Trust Authority provides a hardened root of trust that significantly raises the cost of bypass.
- The Business Authority maintains rapid iteration speed for the features customers interact with daily.
- Clear separation of concerns: each authority has distinct responsibilities, review processes, and failure modes.

**Negative:**
- Two-language codebase increases hiring and onboarding complexity.
- The Trust ↔ Business boundary adds communication overhead (data serialization, transport).
- Some features (e.g., debt consolidation) sit at the boundary between trust and business, requiring careful architectural judgment.

#### References

- Section 1 (Architectural Principles) — the three-authority model
- Section 7 (Services Provided by Rust) — the Trust Authority's public contract
- Section 9 (What Must Never Leave Rust) — operations permanently in the Trust Authority
- Section 15 (Decision Framework) — how to decide where new features belong

---

## 20. Open Questions (Deferred)

| Question | Decision | Reason |
|----------|----------|--------|
| Should the Rust Core be a separate Cargo crate? | **No** (keep in same crate for now) | The Rust Core and Tauri Shell are conceptually separate but share the same binary. A separate crate may be warranted when the Trust Authority codebase grows significantly. Revisit when the codebase warrants it. |
| Should the Rust Core have a separate test crate? | **No** (use `#[cfg(test)]` in same crate) | Simpler for current scope. |
| Should we add a Rust-native HTTP server for health checks? | **No** | Current TCP socket polling works. Keep it simple. |
| Should the Rust Core expose a C ABI? | **No** | Not needed for v1. Document as future consideration. |
| When should a gate be escalated from Hono to Rust? | **Security review + threat model update** | When significant bypassing is detected. |
| Should Rust own database migration state? | **No** | Keep in Hono. Rust doesn't access the database. |
| What is the Rust Core testing strategy? | **Unit tests** for all crypto ops, **integration tests** for full license workflow, **property-based tests** for license parsing (fuzzing). |

### Related Documents

| Document | Location |
|----------|----------|
| Rust Core PRD | `docs/prd/rust-core-prd.md` |
| Licensing Architecture | `docs/licensing-architecture.md` |
| Update & Release Architecture | `docs/update-architecture.md` |
| Architecture Decisions | `docs/architecture-decisions.md` |
