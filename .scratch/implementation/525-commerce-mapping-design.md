# #525/#526 commerce caller mapping

## Worktree and authority

Worktree: `/d/worktrees/tuari_react_hono/t3-b54eedd8-ea26d4c6ebb1732d`.
Base: `23e22ecf75a0cde7a5998673b90969683157ef68`.
Goal: map #525 invoice/payment and #526 inventory-money callers in one English acceptance document using source inspection only. The parent source tree `D:/worktrees/tuari_react_hono/feat-issue-525-exact-in-81cd83c9563367be` is read-only.

Verification mode: `focused-local / CI-final-enforced`, inherited as specified from the parent #525 design and its develop ruleset 26837184 / CI acceptance app 15368 evidence. This document task does not recheck hosted enforcement or claim CI acceptance. No protection change, activation, migration, test run, build, browser run, dependency install or child dispatch is authorized or performed.

## Scope

Only these paths are authorized:

- `docs/money/525-526-commerce-caller-matrix.md`
- `.scratch/implementation/525-commerce-mapping-design.md`

The matrix records all ten tables and fifteen exact monetary fields, source scales and nullable states, source operands, independent stock quantity, SQLite and memory adapters, service writers, exact contract and standalone RPC paths, React forms/views, debt ownership/direction, transaction and replay behavior, issue #336 overlap, current app-entry limitation, named acceptance tests and what this inspection did not execute.

## Domain and interface decisions

The money model distinguishes Money2 finalized minor-unit values from optional Price4 operands. Quantity is a separate six-place stock value. Line source intent remains explicit: entered unit price, agreed total or derived price with its original source quantity. The document total is finalized once; it is not reconstructed from a rounded display price.

Invoice/payment and inventory modules write different producer aggregates but share exact debt ownership through the exact finance service. Domain stock, invoice, payment, ledger and receipt writes need one shared synchronous transaction. Durable command replay uses complete canonical intent and actor; changed intent conflicts. It does not make an absent production route safe to activate.

The workspace is injected with exact clients and reference data. `ExactCommerceWorkspace` is not mounted in production routes. Activation is prohibited; existing production routes remain numeric.

## Review depth

Documentation-only caller mapping. No code, interface, adapter or test changed. No seam moved. No formal review verdict, issue closure, runtime proof or merge readiness is claimed.

## Verification record

Before implementation, `git status --short --branch` was clean and `HEAD` equaled the requested base. Source, named tests and issue bodies were read. The implementation did not run tests because this is code-inspection-only documentation and the user explicitly required tests/assertions to be distinguished from executions actually verified.

Post-commit source snapshot checked: `a48dbdb18542dd12e4e8b9c49debe154b8ae3805`. `git show --check --oneline HEAD` exited 0. The scoped Python relative-Markdown-link check over the two authorized documents exited 0 (`relative links: valid`). Scoped `rg` checks for schema columns, service classes, adapters, React paths and test cases exited 0. `rg -n "ExactCommerceWorkspace|exact-commerce-workspace" apps/web/src/router.tsx apps/web/src/main.tsx apps/web/src/features/shared/exact-commerce-workspace.tsx` exited 0 and found only the workspace declaration, not a production route import. These checks validate document links, source references, route absence in the checked entry files and whitespace only. They are not runtime proof. No tests were run.

## Applied and excluded lessons

Applied: `money-split-shares-must-reconcile-allocate-across-lines-never-per-line` distinguishes exact allocation conservation from per-line rounding. `runsynctransaction-composes-nested-wraps-are-savepoint-joins-and-wrapping-every-sync-writer-makes-the-tripwire` informs shared transaction and rollback ownership. `a-money-bound-on-a-derived-default-must-also-bound-the-field-it-derives-from` was checked against the current exact source model; the old Number-derived bound does not replace the approved full int64 money contract.

Excluded: the wider #523 matrix is a legacy numeric baseline, not proof that its listed production routes now use the isolated exact adapters. The parent design notes no dependencies are installed in the previous equipment-test worktree; no test execution or dependency install was attempted here. No wisdom file is added or changed.

## Remaining limitations

This is a pinned-source acceptance map, not executed regression evidence. Exact SQL adapters and routes are opt-in composition; no production migration or route mount is authorized. #336 duplicate-ID and in-transaction delete follow-ups remain distinct and are not claimed closed. Parent owns review, publication, CI acceptance, activation and merge decisions.
