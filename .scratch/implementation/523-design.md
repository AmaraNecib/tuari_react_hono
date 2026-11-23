# Issue 523 inert exact-money foundation

## Pin and authority

Worktree: `D:/worktrees/tuari_react_hono/feat-issue-523-independ-cb976fb2865f4501`.
Branch: `feat/issue-523-independent`. Fetched base: `17d6277bee359a059d0af5d5befaa887446fae9b`, matching origin/develop at intake.
Clean at intake. This independent issue owner has publication and conditional merge authority, not a worker-only handoff.

Live acceptance sources are issues #523, #520 and #519. Approved financial decision is commit `af576cef78f668f226caf8b0fa6202a0e2205291`, imported byte-for-byte by cherry-pick. All three provided artifact hashes match. ADR 0001 supersedes only historical pending-review sentences. Driver research is pinned at `4f1c73d3b8c4edaad420d146dfc93c58392d666b`, not runtime proof of this implementation.

## Risk and verification

High-assurance, because money arithmetic, future schema preparation and native driver decode can lose digits or change meaning. Mode is focused-local / CI-final-enforced. Intake effective branch rules are retained locally at `.scratch/reviews/523/intake/effective-rules.json`. Recheck current enforcement and exact-head CI before merge. No CI/protection edits.

Pre-agreed test seams from #520 and the issue brief are the shared parser/wire/formatter/arithmetic/allocation interface and actual selected factory driver bind/read capability. Focused failing-first tests exercise those public interfaces, with literal independent expectations. Native tests use both factory-selected drivers, fresh temporary files and reopen; ordinary counts and flags retain existing number reads. No routine full local suite/build/browser run. Contracts compilation, if required by adapter imports, is an explicit test prerequisite, not a product build claim.

## Module and domain

Finalized amount means checked reversal-safe symmetric int64 minor units. Entered unit price means four-place input, distinct from a finalized amount. A salary reference retains its period and scale, not an earning. A quantity remains a separate exact finite-decimal value. Exact line means source price times quantity or an authoritative agreed total. A derived price retains original total and quantity, not a cached four-place approximation. Allocation identity and recorded order are immutable calculation inputs.

The shared module hides parsing, coefficients, signed finalization and allocation behind an additive interface. Its deletion would force each future caller to duplicate these rules. The storage module is a small native adapter, not a generic repository framework. It uses statement-local integer mode and an explicit projected money column, returning exact minor-unit strings. No global integer default, Number bridge or production caller is introduced.

Resource bounds are engineering guards, not commercial amount caps. Decimal input length, quantity precision, operation counts and intermediate coefficient size are bounded. Final writes and arithmetic results reject outside the symmetric int64 range. Report aggregation may remain wider through exact string output.

## Inertness and exclusions

Only new shared exports and new native capability files are allowed to affect source. No current business reader, writer, schema, startup, public RPC contract, UI, quantities policy or balance authority is switched. No new persisted monetary table/column is introduced. Tests use isolated fixture tables only. No #427 policy, #524–#530 execution, database deletion, dependency addition or release claim.

The exhaustive caller matrix is a separate committed document under `docs/money/`, covering every existing physical field and generic/dynamic paths. It does not claim conversion. Approved semantic classification remains unchanged.

## Review and merge

Freeze complete committed source for three distinct initial sessions in order: debate, test-audit, code-review. Ordinary reviewers use Luna explicitly. Record actual session/model identity and any owner-approved same-family exception. Fix findings with affected proof and one fresh combined-delta review carrying unchanged conclusions. Apply scoped architecture review to these new interfaces and direct callers.

Publish complete scope, link/watch the PR immediately and request Greptile once per head. Current-head 5/5, finding resolution, enforced CI acceptance, clean mergeability and effective protection are separate gates. An inert additive non-UI implementation is cheap to reverse by removing unused files/exports; no data or live writer rollback is involved. Any discovered activation or expensive reversal needs owner approval and blocks self-merge. Design approval alone is not runtime acceptance.
