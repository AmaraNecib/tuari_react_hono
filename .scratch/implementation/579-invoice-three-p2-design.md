# Invoice attachment lifecycle corrections

## Scope and authority

Worktree: D:/worktrees/tuari_react_hono/t3-3c0b8c1f-e4a737413138c316.
Original base: 65c4755b96332ffad27612a589fdf1c838726c70.
Invoice prerequisite: 381b7c1ec4cbe0f8e1d8a0d8f06acecdb89aeb63, cherry-picked here as 75bcdb25 (effective base).
Mode: focused-local / CI-final-pending. High assurance because the reachable
failure persists a receipt against the wrong inventory purchase. This is a
bounded correction after the parent's full combined review, not a new feature
or a routine-review trial task. Parent owns the fresh combined-delta review,
publication, history integration, hosted acceptance and merge.

Only attachment UI, purchase page and mounted route tests change. No backend,
contracts, schema, write policy, generic invoice lifecycle or transfer-history
source changes. The existing purchase form remains unchanged.

## Recovered draft and diagnosis

Saved the retired tree's binary diff HEAD to ignored evidence before applying
it here. The retired source, logs and generated output were not modified.
Its group identity key was useful; its upload/reload lifecycle was incomplete:
the catch inspected a stale rendered uploaded flag, retry did not acquire a
pending guard, and query refetch did not throw by default. The draft was saved
but replaced with baseline before adding and executing regressions. Baseline
mounted execution produced five failures and three passes in one selected file.
The earlier retired broad web collection (721 passes / 49 failed suites) is a
setup failure, not proof for this correction. It is not repeated or relabeled.

## Model and interfaces

An inventory purchase group owns its receipt draft. A generic commercial
invoice is a different aggregate. The selected purchase detail is now a keyed
component, so its query observer, local receipt selection, upload error and
in-flight reconciliation belong to one immutable group identity. Keying only
the editor is insufficient: the old parent's query observer can follow B before
A's upload completion calls refetch. The detail component now owns that observer.

The draft hook owns a synchronous operation lock and rendered pending state.
Submission covers the upload and authoritative reload. A successful upload
clears only the captured batch, resets the native file input and records that
only reconciliation remains. A failed reload retains that state and offers
Retry, which refetches without another POST. Replacement and repeat submission
are blocked through both upload and reload, including retry. Initial upload
failure retains the files and permits an upload retry. A missing cached detail
still gets loading/error recovery; a background reload error keeps the existing
editor mounted so it cannot lose its successful-upload recovery state.

The existing create form calls upload without a reconciliation callback and
closes on success; its retained created ID / failed-upload retry is unchanged.
No new upload deduplication or transport receipt guarantee is claimed.

Definitions are an independent prerequisite. Pending and failure name the
existing translated item-definition resource, and Retry calls only definitions
refetch. Initial create intent remains true until definitions arrive, so the
real purchase form initializes its first line from an actual active definition.
Existing translations, labels, shared controls, RTL layout and downloads stay.

Deletion test: removing the draft hook would push file validation, operation
locking, successful-upload recovery and input reset into each caller. Removing
the keyed detail component would put a mutable query observer back across owner
boundaries. These are scoped lifecycle seams, not a broad query redesign.
Parent architecture assessment remains pending after the combined-delta review.

## Verification

Mounted jsdom tests use the real HomeView purchase composition, real queries and
mocked client/upload/download transports. Tests visit B, then A, then cached B
with a selected file and separately an upload failure; they also hold A upload
across a switch and verify B's draft and read count are untouched. Slow reload
holds a promise after POST and checks input/Save locking and no second upload.
Rejected reload checks retained editor, guarded retry and exactly one POST.
Definitions alone fail while other queries succeed, then retry opens a valid
form without navigation. Prior browser-link, desktop download, create retry,
generic invoice, forms, equipment and attachment validation cases remain.

Use node's installed Vitest entry from apps/web with explicit file arguments;
never a wrapper script that drops filters. Build only this tree's contracts
prerequisite through heavy_run. Frozen filtered restore uses the existing lock.
Canonical web TypeScript and three-file ESLint checks run locally. Exact commands,
exits, durations, failure logs and committed source fingerprints stay ignored
under .scratch/reviews/579-p2. No full suite, browser agent, server, production
app build or native rerun. Unchanged author native 55-case proof from the
invoice prerequisite is carried with its original provenance, not reexecuted.

## Wisdom

Applied dialog identity/per-draft state, current contracts dist, honest loading
states and primary query identity lessons. No query keys or broad invalidation
changed; historical full E2E advice does not override current CI-final policy.
Validation-before-byte-allocation remains a valid unchanged backend conclusion;
this UI-only correction does not reprove it. No wisdom files written. Candidate:
key the query observer as well as the editor when asynchronous completion owns
an earlier selected record. Parent decides whether that pattern warrants a lesson.

## Remaining gates

Guard Phase 1 requires affected execution, lint, types and diff before commit.
Phase 2 records exact committed fingerprints and affected execution; independent
combined-delta review remains the parent's gate. Hosted CI, enforced protection,
full connected integration and final merge acceptance remain pending. No push,
PR, merge, visual screenshot or real browser/desktop execution is claimed.
