# Slice 543 normal application UI

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-427-independ-2565729f7d01eaa8`, branch `feat/issue-427-independent`. Starting revision: `2a4a56ef5029725320db43137eff8d910aee127b`. Verification mode: `focused-local / CI-final-enforced`. High assurance applies because monthly approval is a durable monetary command and the app root selects authenticated client behavior.

This lane connects the normal configured app to exact employees, approved earnings, and exact project labor cost. It does not activate payments, advances, openings, corrections, full project cost, #544, or #545. The parent owns reviews, browser acceptance, hosted checks, publication, and merge. Six paused #544/#545 files remain byte-for-byte unchanged and unstaged.

## Workspace identity decision

The parent chose a persistent opaque logical workspace UUID inside the exact configured database. Fresh exact initialization creates one singleton identity row in the same transaction as the schema. Reopen validates and preserves it. Backup/restore carries the ID with the workspace. Startup never rotates or repairs a missing or corrupt ID. The authenticated `slice543Capabilities` response returns this UUID with unchanged static feature capability values. The UI keys durable monthly-approval recovery by that returned workspace ID and the authenticated user ID. It never derives identity from API URLs, database paths, keys, or a shared default.

This is an additive slice-543 metadata contract change under the existing fresh exact schema authority. It does not add a monetary record or change any later payroll lifecycle. The exact startup also keeps the existing recovery-key table and security handlers reachable from Settings. These are part of the already-supported account/security runtime, not a later payroll feature.

## Domain and interface

An employee is the exact employee record, identified by the server's string ID. A salary reference is advisory profile data and is not a spending ceiling. An approved earning records a civil earning month, exact amount, ordered project segments, and explicit unallocated remainder. Project labor cost sums approved exact allocations only. A payment remains unavailable.

The normal app must obtain capabilities and the exact client through the configured authenticated RPC link. Numeric `Employee` and money types are not adapters for exact values. Unsupported monetary tabs must not run legacy queries or present fabricated zero values. The slice contract also exposes manager assignment reads so employee edits load the actual manager ID separately from project ownership. Project and warehouse creation and assignment forms use server-returned IDs. The normal settings route keeps the existing recovery-key pool and database-key procedures mounted, backed by the same recovery-key table and configured database key ports.

Monthly approval is a command, not a repeatable form submit. The UI must synchronously persist the normalized full intent before dispatch, reuse that exact key and payload when uncertain, and retain the fence through reload, navigation, read failures, and sign-out/context changes until a valid result clears this command's record. A failed durable write sends nothing.

## Verification plan

Use focused native API tests for UUID creation, idempotent reopen, authenticated disclosure, corruption/missing refusal, and identity preservation through a backup. Use focused web tests at the configured RPC/client and normal root boundaries for exact employee pages, approved earnings allocations, recovery persistence, direct logout/context fencing, and unavailable monetary features. The required literal approval proof is A(5 days, 10000), B(15 days, 37500), A(5 days, 15000), totaling 62500, with project labor A=25000 and B=37500. No full suite, production build, or broad browser run is presumed locally. Record exact-SHA commands and results under ignored `.scratch/reviews/543/`.

## Design assessment

The persistent database UUID gives storage scope the same lifetime and restore behavior as the logical workspace without exposing its location or encryption key. A single authenticated capability response is a small interface for both feature selection and recovery scope. The existing exact employee pages and allocation editor remain the UI modules; this work wires them into the real app rather than building a demonstration app.