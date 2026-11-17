# Normal application naming and schema inventory

## Authority and scope

This is one bounded correction on base `28be811f378601664f3a1204a13fff766a67f4e7`. Verification mode is `focused-local / CI-final-enforced`. The normal configured runtime now uses application-responsibility names; issue numbers remain tracking and evidence labels. Legacy `router.ts` and `app-contract.ts` remain isolated legacy source. No production database, config, key, backup, or schema version is changed.

The normal root uses `application-router.ts`, `createApplicationRouter`, and `ApplicationRouterDependencies`. The shared wire contract is `application-contract.ts` with `applicationContract`, `ApplicationContract`, `ApplicationClient`, `ApplicationCapabilities`, and the authenticated `applicationCapabilities` procedure/schema. The web transport is `application-client.ts`; the app shell is `workspace-shell.tsx` and exports `WorkspaceShell`. Employee and earnings domain modules keep their existing names.

The `mode: "application"` discriminant is in-memory composition state, not a persisted config value. Existing configured database paths and encryption keys remain untouched. RPC capability naming changes together in server and client contract. The normal root test parses the authenticated response through `applicationCapabilitiesSchema`.

## Durable recovery protocol

`tuari:slice543:monthly-approval:v1:<workspace>:<user>` remains the established browser-storage protocol key. Its `v1` record can hold an unresolved approval. The module rename does not migrate, clear, or abandon that record. A comment identifies the key as a stable protocol identifier, and the renamed home integration test still checks the old key.

## Schema P2 correction

Normal startup already validates expected table and explicit index/trigger DDL, but it did not reject additional explicit indexes or triggers. Validation now compares the full application-owned explicit-object inventory and ignores only SQLite internal/generated objects (`sqlite_%` names and SQL-null autoindexes). A native reopen test adds an `AFTER UPDATE OF salary_reference_units ON employee` rewriting trigger and verifies startup refusal without changing `sqlite_master`, the schema marker, or employee data. A parallel explicit-index test checks the same refusal contract. Existing table, DDL, foreign-key, unique, check, predicate, and guard-body checks remain in place.

## Verification and boundaries

Focused proof covers schema inventory refusal, valid fresh/reopen/backup root behavior, authenticated capability wire compatibility, renamed contract/client/UI references, and recovery storage continuity. No full suite, build, browser, hosted check, publication, or review fanout is part of this worker lane. Six paused #544/#545 working-tree changes remain outside this correction and must retain fingerprint `958d07182a1e3ea9fc501b05b4b782414bd42ebb`.
