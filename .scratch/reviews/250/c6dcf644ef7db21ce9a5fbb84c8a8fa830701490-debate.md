# Debate — Issue #250 (Coverage 100%: auth + rbac)

- Base: `fd94c413846934e8722aa098f130e3a5bf9db1c6` (origin/develop at start)
- Head: `431ef7de34d7f285b89693314ad98ebba42638b7`
- Tier: High-assurance (auth/RBAC)
- Critic + Defender run in parallel via reviewer sub-agents (fresh context).

## Findings

| # | Severity | Finding | Decision | Action |
|---|----------|---------|----------|--------|
| 1 | 6 | `**/adapters/**/*.ts` excludes `sqlite-permission-resolver.ts` from the 100% gate even though it is security-sensitive; its branches are unpoliced by thresholds | **Dismissed** — parent issue #248 explicitly decided "Adapters are excluded from coverage"; the adapter's branches (bootstrap-owner shortcut, join, dedupe, pass-through, empty-id) are all exercised by its own test file; the gate measures non-adapter module files by policy. | None |
| 2 | 4 | Stale-permission pass-through test enshrines the #210 vulnerability; when #210 lands the test breaks with no marker | **Fixed** — added `// will-change: #210` marker so the future filter change is deliberate, not a silent pin deletion. | `sqlite-permission-resolver.test.ts` |
| 3 | 4 | Padded-key exact-hash pin assumes the wire gate trims; also `consumeKey` does no service-boundary validation (inconsistent with bootstrap) | **Dismissed** — verified `consumeRecoveryKeyInputSchema` does `.trim().min(1)` at the wire (packages/contracts/src/security.ts), and the trim semantics are pinned in packages/contracts/src/index.test.ts (NBSP/BOM/`\u2028` cases). Service-boundary shape validation for consumeKey would be speculative: an invalid key is harmless (hash mismatch → false, no state change), unlike a bootstrap user creation. | None |
| 4 | 2 | `.scratch/implementation/250-design.md` committed in the change | **Dismissed** — AGENTS.md mandates committing `.scratch/implementation/<issue-id>-design.md`. | None |
| 5 | 2 | `isPermission("employees:create:extra")` returns true — `split(":", 2)` truncates trailing segments; the new unknown-permission tests missed this smuggling case | **Fixed** — `isPermission` now requires exactly one colon (`extra.length > 0 → false`); added tests for `employees:create:extra` / `employees:create:` / `:employees:create`. `isPermission` is the runtime format gate for role_permission rows (sqlite-role.repository.ts:115), so a corrupted row no longer validates. Verified no test relied on multi-colon strings; type-level `Permission` is single-colon by construction. | `permissions.ts`, `permissions.test.ts` |

## Defender-aligned confirmations

- Scope decision (tests only; #230/#234 schema hardening stays in their own OPEN issues) — defended, confidence 9/10. The wire-contract blast radius (sign-in flow + web pre-validation copy) is real; the design doc discloses it.
- ZWSP phone → VALIDATION pins the regex hard gate (bootstrap.service.ts:74-77 re-validates defensively; JS trim() does not strip Cf chars).
- ZWSP / padded recovery keys can never match a stored SHA-256 hash (recovery-key.service.ts:92-97 exact-hash), and the pool-non-empty setup makes the `false` assertions non-vacuous.
- `[...ALL_PERMISSIONS]` copy isolation (resolver bootstrap path + `getPermissionsForRole`) pinned against hostile-caller mutation.
- Empty userId forwarded verbatim into the WHERE clause (`eq(schema.user.id, "")`).

## Result

2 findings fixed and committed (`431ef7d`); 3 dismissed with documented rationale. No blockers.

---

## Post-evidence delta (SHA refresh → 6bb4aed)

Original debate ran at `431ef7d`; the test-audit (at `1c479b8`) added the name
refine + edge-case pins, and code-review (at `6bb4aed`) replaced the field-agnostic
`custom` message branch with a per-field `Record` map. None of these changed the
debate's decisions: findings 1-4 stand as dismissed, finding 5 (isPermission
colon) stands as fixed, and the audit-added name refine extends finding 1's
scope in the same direction (dismissed: separate #230/#234 issues remain OPEN;
the refine is a minimal bootstrap-only fix documented in the design doc).

---

## Post-evidence delta 2 (SHA refresh → c6dcf64, merge of origin/develop)

Merged origin/develop (`c6dcf64`) to resolve the vitest include-array conflict with
the sibling #291 (#249 payment+account coverage, merged to develop). Conflict
resolution: include is now the union
`workforce|invoice|auth|account|payment|rbac` (verified: 100% coverage across all,
399 stmts); `.agents/wisdom/architecture.md` kept BOTH entries (theirs #239 first,
mine #250 second). All other merge content (#285 recurring-drop, #291 account/
payment, #239) was already reviewed/merged on develop in its own PRs. My reviewed
files (auth.ts, bootstrap.service.*, permissions.ts, rbac tests, vitest rbac line)
are byte-identical to the reviewed state; debate decisions unchanged.
