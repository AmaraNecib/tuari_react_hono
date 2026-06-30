# Implementation Roadmap

This document is a high-level navigation aid for contributors. It is **not** a source of requirements. Requirements live in the architecture documents, PRDs, ADRs, and implementation issues.

## Milestone 1 — Rust Trusted Computing Base

Build the foundational Rust modules that the Trust Authority depends on.

| Module | Architecture Source | PRD |
|--------|-------------------|-----|
| Licensing Rust Core (`license.rs`) | Licensing Architecture §15.1 | Licensing PRD §3.3 |
| Shared crypto (`crypto.rs`) | Rust Core Architecture §6.1 | Rust Core PRD §3.1 |
| Trust Authority capability stubs | Rust Core Architecture §3 | Rust Core PRD §3.1 |
| Recovery primitives | Update Architecture §20 | Update PRD F10 |

**Depends on:** None

---

## Milestone 2 — Updater Engine

Build the update orchestration layer, independent of desktop platform.

| Module | Architecture Source | PRD |
|--------|-------------------|-----|
| Package verification (`update.rs`) | Update Architecture §3 | Update PRD F1 |
| Update Provider abstraction | Update Architecture §15 | Update PRD F2, F3 |
| Update Strategy abstraction | Update Architecture §16 | Update PRD F1 |
| Back-up, stage, apply, rollback logic | Update Architecture §5 | Update PRD F4, F6 |
| Recovery Environment | Update Architecture §20 | Update PRD F10 |
| Database migration runner | Update Architecture §18 | Update PRD F5 |

**Depends on:** Milestone 1

---

## Milestone 3 — Tauri Integration

Bridge the Updater Engine to the desktop environment.

| Module | Architecture Source | PRD |
|--------|-------------------|-----|
| Tauri IPC commands for updates | Update Architecture §6 | Update PRD F2, F3, F4 |
| Platform-specific file locking | Update Architecture ADR-UPD-001 | Update PRD F6 |
| Sidecar restart coordination | Update Architecture §13.3 | Update PRD F4 |
| Stub updater (locked-file handler) | Update Architecture ADR-UPD-001 | Update PRD F4, F7 |
| Portable update support | Update Architecture §17 | Update PRD F7 |

**Depends on:** Milestone 2

---

## Milestone 4 — Business Authority (Hono)

Add update and licensing awareness to the API sidecar.

| Module | Architecture Source | PRD |
|--------|-------------------|-----|
| Update metadata endpoint | Update Architecture §4 | Update PRD F2 |
| Database migration execution | Update Architecture §18 | Update PRD F5 |
| Update history table | Update Architecture §4 | Update PRD F5 |
| Current version in session | Update Architecture §4 | — |
| Feature gate middleware (Hono side) | Licensing Architecture §5.3 | Licensing PRD F4 |

**Depends on:** Milestone 1

---

## Milestone 5 — Presentation Authority (React)

Build the user-facing update and licensing interface.

| Module | Architecture Source | PRD |
|--------|-------------------|-----|
| License activation UI | Licensing Architecture §15 | Licensing PRD F5 |
| License status display | Licensing Architecture §15 | Licensing PRD F11 |
| Check for Updates button | Update Architecture §7 | Update PRD F2 |
| Download progress indicator | Update Architecture §7 | Update PRD F2 |
| Offline update file picker | Update Architecture §7 | Update PRD F3 |
| Restart prompt | Update Architecture §7 | — |

**Depends on:** Milestone 3 (for real command testing) + Milestone 4

---

## Milestone 6 — Release Engineering

Build the tooling that produces signed releases.

| Module | Architecture Source | PRD |
|--------|-------------------|-----|
| `sign-update` CLI tool | Update Architecture §8.2 | Update PRD F1, F8 |
| CI/CD pipeline config | Update Architecture §8 | Update PRD F8 |
| Release channel management | Update Architecture §11 | Update PRD F8 |
| Update metadata generation | Update Architecture §14.3 | Update PRD F1 |
| ADRs: UPD-001 through UPD-008 | — | — |

**Depends on:** Milestone 2 (for verification logic compatibility)

---

## Milestone 7 — Production Hardening

Vet the entire system before the first customer release.

| Activity | Source |
|----------|--------|
| Integration tests (end-to-end update cycle) | Update PRD §9 |
| Database migration tests (success + failure) | Update PRD §9 |
| Recovery and rollback tests | Update PRD §9 |
| Performance profiling | Rust Core PRD §5 |
| Security review (threat model validation) | Security Architecture (future) |
| E2E tests (Playwright + Tauri harness) | Update PRD §9 |

**Depends on:** All previous milestones

---

## Dependency Graph

```
Milestone 1 (Rust TCB)
    ├── Milestone 2 (Updater Engine)
    │       ├── Milestone 3 (Tauri Integration)
    │       │       └── Milestone 5 (React UI)
    │       └── Milestone 6 (Release Engineering)
    └── Milestone 4 (Business Authority)
            └── Milestone 5 (React UI)
```

Milestones 2 and 4 can proceed in parallel after Milestone 1.
Milestones 3 and 6 can proceed in parallel after Milestone 2.
