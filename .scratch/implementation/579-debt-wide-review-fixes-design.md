# PR 579 debt direction, wide totals and manual cancellation

## Scope and authority

Worktree: `D:/worktrees/tuari_react_hono/t3-0ecac080-01d0c5970a7a6e45`.
Base: `18b065b1345653166eec74ade50ba9c41b7333fc`.
Mode: focused-local / CI-final-pending. High-assurance because incorrect signs,
overflow and cancellation targets change the financial meaning shown to users.
Parent owns combined-delta review, integration and publication. This worker does
not push, open PRs or merge. No children.

Read the retired writer's diff in `t3-2a10f1ec-87525ab1f40adb09` without
changing that checkout. Imported only four authorized source patches after new
regressions ran. Replaced its private aggregate parser with the existing contract
sum and fixed its overly broad child action policy. Did not import its manifests,
generated outputs, evidence, tests or design note.

## Verified hosted findings

Item 2, thread `PRRT_kwDORksw9M66I5rC`, and duplicate
`PRRT_kwDORksw9M66I-13` are valid. Account currentBalance is relative to its
own direction. External positive net means receivable. Contributions are therefore
RECEIVABLE balance and negated PAYABLE balance. Payable 500 and receivable 300
produce -200. Equal balances cancel; credits reverse their account direction.
Existing grouping checks party type before matching the external ID.

Item 10, thread `PRRT_kwDORksw9M66I5r1`, and duplicate
`PRRT_kwDORksw9M66I-2R` are valid. Dashboard and scoped debt totals used bounded
Money addition; transfer history reparsed a wide total as stored Money. External
net display also reparsed the aggregate. All these paths now retain wide strings.
The dashboard preserves ar-DZ grouping and optional cents. Other displays reuse
formatExactMoney with aggregate enabled only for totals. Stored values still use
bounded Money. No Number, parseFloat or toFixed conversion was added.

Item 12, thread `PRRT_kwDORksw9M66I5sA`, is valid. Backend
exact-finance.service obligation rejects children for pay/correct, while voidEntry
accepts a live owned child and targets that entry. The UI now offers cancellation
for live manual children separately from original-only payment/correction.
Producer-owned and voided entries still have no generic actions. Cancellation
submits the child's entryId, never the original's ID.

No aggregate exists in home-view-signed-in-shell's exact debt search description;
it formats individual account balances. That file is unchanged. Paging, payroll,
invoice routes, stock panels, translations, schemas and APIs are outside scope.

## Design and proof

Vocabulary: stored Money is bounded; report totals are wide display-only strings.
No domain model or command contract changed. Existing sumMoneyHistory hides the
BigInt arithmetic and existing formatExactMoney hides display validation. No new
module or interface is needed. Deleting these call-site fixes restores reachable
wrong labels, aggregate overflow and missing child cancellation. Architecture:
no seam moved; the parent reviews changed call sites and their direct callers.

Focused DOM tests assert actual amounts and direction labels. They cover wide
scoped totals with colliding worker/external IDs, dashboard totals, external net
rendering, history rows and aggregate, and live manual payment/correction child
cancellation including exact submitted entryId. Query tests cover sign, zero,
credits, party filtering and wide net cents. Existing original action tests remain.
Mutation checks restore bounded scoped aggregation and broad draft child actions,
and independently disable aggregate formatting for externals/history. Each mutation
fails the corresponding behavior tests; mutations are restored before final proof.

Local dependencies use ignored junctions to installed parent packages. Web/API
@tuari/contracts resolve this checkout's independently generated dist, not stale
parent outputs. Contracts compilation is the only build prerequisite; it runs
through heavy_run. No shared generated output or package manifest was changed.
Raw failures, retries, commands and fingerprints remain ignored under
`.scratch/reviews/579-debt-wide/`. No browser run or full suite was performed.

Applied wisdom: dashboard loading/error values and deterministic ar-DZ formatting
remain intact; omission and explicit zero remain distinct in existing create tests.
Exact query invalidation ownership is unchanged. No new wisdom entry is written.
