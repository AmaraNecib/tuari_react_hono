# Issue 493: translation usage enforcement

Worktree: `D:/worktrees/tuari_react_hono/fix-v1-issue-493`.
Base and target: `fa0788548ad2a7c2d88791820d3bf4033142e844`, `origin/develop`.
Spec: live issue #493, F3 unused keys and F5 explicit account direction with a positive opening magnitude.
Tier: high-assurance because the acceptance audit includes debt-direction contracts. Implementation is translation tooling and unreachable resource cleanup, not a new money policy.
Mode: focused-local / CI-final-enforced. Effective ruleset 26837184 was read live, active, strict CI acceptance from app 15368, no bypass actors and current user cannot bypass. Historical pending activation prose is not current protection evidence.

## Source findings

`debtAccountCreateInputSchema` already requires direction and accepts only a finite positive supplied opening. Omission means no opening. Existing contract tests cover missing direction even with a locked category, negative and zero openings, positive and omitted openings. Preserve this behavior. `employeeDebtEntryCreateInputSchema.direction` is a different interface with documented defaults; changing it would invent scope.

The existing scanner checks missing keys and indirect dotted literals but has no unused-key gate. Its namespace list misses newer namespaces. Production usages include lookup maps, helper-returned literals and conditional arguments. Tests must not keep abandoned product copy alive. All current computed calls have finite dotted-key sources; no global dynamic-key exemption is needed.

## Implementation

Keep the CLI as the enforcement interface, with a small pure usage module accepting resources and named production sources. Collect literal references across production modules, including indirect map/helper keys across all resource namespaces. Match templates and concatenations against anchored static pieces. Support explicit object-return subtrees and plural variants without exempting unrelated siblings. Comments and test fixtures are not product usage. Report unused leaf keys in text and JSON and fail the same normal lint/test gate.

Audit unreferenced resources before deleting them. Coordinate `ar.ts` with #443 and preserve keys used by its pending shared-table work. Its owner confirmed `systemLog.title` and `shell.workspace` gain consumers there; retain them. The initial isolated-tree gate reports exactly these two pending consumers until #443 integrates. This is an explicit integration dependency, not an accepted green check. Remove 73 other unreferenced leaves. No exemption is added. Refresh against latest develop with merge-only integration. No blanket baseline or wildcard allowlist. No reachable UI change is intended; if one becomes necessary, stop to gather real pinned visual evidence first.

## Verification and review

Add focused CLI fixtures proving nonzero exit for a newly orphaned key and preserve missing-key enforcement. Cover indirect maps, new namespaces, conditional keys, templates, concatenation, plural/object use, comments and test-only references. Run existing debt-contract regressions and relevant web tests after resource cleanup. Save exact commands, durations and native exit codes under ignored `.scratch/reviews/493/`.

Commit before separate debate, test-audit and code-review sessions. Use the owner's standing same-family separate-session exception where needed. Obtain exact-head Greptile 5/5 and CI acceptance, recheck strict protection and up-to-date status before an authorized merge. Notify coordinator only after confirmed merge or a genuine owner blocker.

## Module and domain assessment

A translation leaf is unused when no production literal or bounded dynamic construction can select it. A debt opening is an optional positive magnitude; account direction carries its financial meaning. These are separate domains.

Usage classification earns its module by keeping AST details behind `findUnusedKeys(resource, sources)`. Removing it would put that logic back into the CLI and fixtures. No product-domain seam or published contract changes. Architecture review is scoped to the scanner's new internal seam.

Applied lessons: distinguish i18next options from text fallback; follow indirect key maps; preserve omitted openings and audit the actual account interface rather than a different optional direction field. No new recurring wisdom is claimed.
