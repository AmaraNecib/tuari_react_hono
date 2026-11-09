# Issue #480 shared decimal rounding

## Scope and authority

Issue: https://github.com/AmaraNecib/tuari_react_hono/issues/480

Both roundMoneyToCents and roundQuantity implement decimal-string scaling with a half-away-from-zero rule. Extract one implementation without changing their observable behavior. Live issue read on 2026-11-09 had no comments. Worktree is D:/worktrees/tuari_react_hono/fix-issue-480-independe-7900306583c95566. Fresh origin/develop and initial HEAD are eb4c16d05fd9ed187b825bdd94b057bfe8073396.

Tier: high-assurance. A rounding regression can change persisted salary amounts or inventory balances. Verification is focused-local / CI-final-enforced. Ruleset 26837184 was read live: active, strict CI acceptance from app 15368, no bypass actors, resolved threads, deletion and non-fast-forward blocks. Historical pending activation prose is superseded by the owner's rollout and this live read. Recheck before merge; never change protection.

Expense RPC handler/tests belong to peer #425. Windows Rust CI belongs to peer #489. Neither is writable for this task. No UI, schema, validation-bound, dependency or financial policy changes.

## Domain comparison before extraction

Money means DZD rounded to cents. Quantity means consumable stock normalized to six decimal places. A decimal grid means the Number's decimal representation already describes whole units at the requested precision. These terms already exist in the code; no new domain term or glossary change is needed.

Both helpers accept number at their exported interfaces and return non-finite inputs unchanged. Ordinary decimal strings scale through Number(`${value}e${decimals}`), then round magnitude and restore sign. This preserves historical 1.005, 8.575 and 0.145 fixes rather than multiplying binary floats.

Their full domains are not identical:

- Money deliberately falls back to Math.round(value * 100) / 100 for scientific notation. Negative tiny values can produce negative zero, and extreme finite values can produce infinity. Preserve these results even outside normal salary inputs.
- Quantity preserves values already on its decimal grid before scaling. Scaling and dividing a large balance can change it. Its exact BigInt micro-unit parser remains inventory-owned and also supports balance arithmetic and mutation checks.
- Quantity uses sign-symmetric rounding for scientific-notation ties such as -5e-7. It returns overflowing magnitudes unchanged and normalizes negative zero to positive zero.

Thus sharing the entire wrapper algorithm would be incorrect. Retain each domain's guard/fallback policy. Share the decimal-scaling and magnitude-rounding calculation only. The money scientific-notation compatibility branch is not a second half-away-from-zero rule; it is the existing, deliberately preserved Math.round fallback.

Money validation permits amounts through Number.MAX_SAFE_INTEGER, and legacy stored money may exceed input bounds. Quantity has no equivalent money ceiling and explicitly supports huge grid-aligned balances. Do not borrow one domain's bound for the other.

## Implementation and seams

Add roundToDecimals in packages/contracts. Its precision is restricted to the two actual consumers, 2 and 6. It scales ordinary decimal strings, falls back to a binary product for scientific notation, restores sign after rounding magnitude, and returns the original value if scaling overflows. It preserves rounded signed zero. Export the helper through the existing package entry point so API inventory imports the built package rather than crossing source directories.

Keep roundMoneyToCents and roundQuantity names, arguments and callers unchanged. Money owns scientific-notation compatibility; inventory owns exact-grid detection and zero normalization. No existing exported type or wire contract changes. The new shared helper is an additive pure utility for the requested extraction.

Deletion test: removing the shared module would put decimal scaling, symmetric ties and scaled-overflow handling back into callers. It earns its interface. Inventory decimal addition/subtraction and BigInt parsing are not rounding duplication and remain untouched.

## Proof and review

Test agreed seams from the issue: shared rounding, both public wrappers, salary/contracts validation and inventory service write paths. Use literal independent expected values, including signed ties, near-ties, scientific notation, tiny/huge inputs, zero signs and historical precision regressions. First characterize existing wrappers on the unchanged implementation. The new shared interface has failing-first proof before implementation. Preserve negative stock and unrepresentable-delta checks in affected integration tests.

Run focused contracts salary/rounding and existing schema tests, inventory helper/outbound availability cases, and salary service coverage cases. Contracts compilation is a prerequisite because API tests import its dist entry point; this scoped dependency build is not a production/full workspace build. Run relevant contracts/API typecheck and changed API-file ESLint. Save native exit codes, counts, duration and raw logs under ignored .scratch/reviews/480. Full suites and production builds remain CI-final.

Commit complete source/test/design scope before distinct debate, test-audit and code-review sessions, in that order, on the actual frozen worktree. Ordinary reviewers use explicit Luna. Same-family separate-session review uses the owner's standing exception because optional OpenCode is not enabled. A bounded correction gets one fresh combined-delta review. Parent performs scoped architecture review after clean local review.

Publication and merge are authorized only after all existing gates. Request Greptile once per pushed head, require current-head 5/5, CI acceptance and resolved findings. Link and watch at PR creation. Recheck effective protection and fresh issue state. Stop after #480 and notify coordinator on actual merge or genuine blocker.

## Reversal assessment

No UI/UX, migration, durable-format or external-side-effect change is intended. Existing public wrapper behavior is preserved, and the additive utility has only these repository consumers. Reverting the source commit restores the previous algorithms without data conversion, compatibility repair or undoing an external action. The change is cheap to reverse if the tests and reviews confirm that scope; otherwise seek owner approval before merge.

## Applied lessons

The money-bound lesson requires tracing both domains rather than sharing ceilings; this extraction changes no bound. The salary-split lesson confirms allocation and proration are separate rules and must not be rewritten through this helper. Exact-SHA evidence discipline applies, but the old lesson's instruction to commit reports is superseded by the current workflow: reports remain ignored and local, with bounded review refreshes rather than evidence commits.
