# Tuari — Architecture Documentation

This directory contains the canonical architecture documentation for the Tuari project. These documents define the permanent architectural boundaries, decisions, and product requirements.

## Quick Navigation

| Document | Description |
|----------|-------------|
| **Architecture Decisions** (`architecture-decisions.md`) | All Architecture Decision Records (ADRs) for the project |
| **Licensing Architecture** (`licensing-architecture.md`) | Offline licensing system design: Ed25519 signatures, edition model, feature gating, license activation, key management |
| **Rust Core Architecture** (`rust-core-architecture.md`) | Permanent boundaries between Trust Authority (Rust), Business Authority (Hono), and Presentation Authority (React) |
| **Update & Release Architecture** (`update-architecture.md`) | Build pipeline, release pipeline, update system, rollback, recovery, database migrations |

## Product Requirements

| Document | Description |
|----------|-------------|
| **Licensing PRD** (`prd/licensing-prd.md`) | Requirements for the offline licensing system |
| **Rust Core PRD** (`prd/rust-core-prd.md`) | Requirements for the Rust Core architecture |
| **Update & Release PRD** (`prd/update-prd.md`) | Requirements for the update and release system |

## Architectural Authorities

The Tuari application is built around three architectural authorities:

| Authority | Owner | Responsibility |
|-----------|-------|---------------|
| **Trust Authority** | Rust (Rust Core) | Cryptography, secrets, licensing, secure updates, trust decisions |
| **Business Authority** | TypeScript (Hono) | Business workflows, validation, CRUD, reporting, domain logic |
| **Presentation Authority** | TypeScript (React) | UI rendering, user interaction, client-side state |

See the [Rust Core Architecture](rust-core-architecture.md) document for the full authority model.

## Reading Order

1. **Architecture Decisions** — Start here to understand the key architectural decisions and their rationale.
2. **Rust Core Architecture** — Understand the three-authority model and permanent boundaries.
3. **Licensing Architecture** — Understand the licensing and feature gating system.
4. **Update & Release Architecture** — Understand the build, release, and update lifecycle.
5. **PRDs** — Reference during implementation for specific feature requirements.

## Document Status

All architecture documents in this directory are **Approved** and **Canonical**. Changes to architecture should happen only through a new ADR or a deliberate architecture revision, not through ad-hoc edits during implementation.
