# Lazy transfer history

Tree D:/worktrees/tuari_react_hono/t3-325c5784-5ae51d0de1304d55. Original base 65c4755b96332ffad27612a589fdf1c838726c70. Effective dependency 05a9c377, cherry-picked from invoice 381b7c1ec4cbe0f8e1d8a0d8f06acecdb89aeb63. Asset interface committed first at 768ac0b2. High assurance because exact money provenance and inventory read correctness are reachable. Mode focused-local / CI-final-pending. Parent owns independent review, publication and acceptance.

## Terms and seam

A history candidate is a source key plus searchable labels, timestamp, typed locations and authoritative total operands. It is not a hydrated display row. A page contains hydrated rows only for the selected candidate keys. A summary covers the full filtered candidate set, not accumulated browser rows. Purchase, movement and outbound remain disjoint source identities even if IDs overlap.

The repository adds listHistoryCandidates and keyed getMovement. The native candidate adapter selects metadata and item names directly from actual inventory tables without reading source price JSON, charges, attachments or complete debt allocation graphs. It applies the existing per-source resource bound. The service applies global date, type, location and search filters and descending date/ID ordering before choosing display keys. Selected rows reuse authoritative repository hydration and existing finance.detail allocation semantics. Native display hydration scales with the requested page. Candidate metadata and original obligation validation still scale with history size; this is not a constant-time SQL summary claim.

Global outbound totals need the live original signed amount, not current paid allocations. ExactFinanceService.historyOriginal checks the account and original entry directly, including account ownership, LIVE status and original identity. Missing account/original/live links fail even off-page. Selected display outbounds still use the current complete finance allocation graph, cached once per selected account. No write, schema, auth, license or accounting rule changed.

The memory adapter follows candidate semantics from its existing records. Candidate label duplication is confined to the two real storage adapters. Deleting the read module would force global graph hydration back into the service. Financial allocation remains owned by finance, not duplicated in SQL.

## Interface and browser behavior

financial.inventory.transferHistory preserves items,total,offset,limit and adds summary { total:number, sales:number, internal:number, totalAmountDzd:string }. The amount is the existing wide sumMoneyHistory aggregate and can exceed persisted Money bounds. Individual amounts remain bounded exact strings.

The hook requests one initial page, 50 globally or 10 for a typed location. Next pages are explicit fetchNextPage requests. It retains the existing data.items consumer shape and exposes hasNextPage/isFetchingNextPage. Full summary comes from the server, never loaded rows. Owner, filters and typed locations are in query keys; changed keys reset accumulation and AbortSignal reaches ORPC. No eager fetch-all loop remains. Page and location view buttons request the next page and disable during that request. Frozen stock-location source is untouched.

Date comparison retains inclusive Algeria business-day bounds and existing date-string/ID ordering. Offset pagination provides stable ordering for an unchanged dataset, not a cross-request snapshot under concurrent inserts. Existing behavior is preserved rather than introducing a cursor contract.

## Proof and limits

Asset history has failing-first proof on the recovered draft. Pagination contract and execution tests were added after the first implementation extraction; no red-first pagination execution is claimed. Native plain/keyed cases exercise 132 real source records, wide full totals, tied ordering, all pages without holes/duplicates, search, typed locations, inclusive date boundaries and off-page broken/live links. Repository hydration and actual prepared SQL are instrumented while native storage remains real. Browser hooks prove initial/next request counts, location ten, full wide summary, key reset and cancellation. The page display test has one loaded row but a larger full summary.

Affected service/RPC/contracts/web tests, package typechecks and changed-file ESLint run locally. Contracts compile only in this worktree because native API execution imports its output. No full suite or browser expansion is claimed. Exact-head commands, counts, exits, durations and fingerprints live in ignored .scratch/reviews/579-recovery. Prior failures and the recovered binary patch stay intact there; the retired worktree is unchanged.

Applied wisdom: purpose-shaped read ownership, no false loading/error zero, and current-head evidence. The old locale-specific numeric-money advice is superseded by current exact-money formatting. Historical review-file renaming advice does not replace a fresh current-head execution or review. No worker-written wisdom. Parent review and CI-final/hosted acceptance remain pending.
