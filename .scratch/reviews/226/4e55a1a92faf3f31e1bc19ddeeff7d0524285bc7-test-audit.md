# Test audit — issue #226

**Base:** `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c`
**Head at audit:** `fbbcd68` → `4e55a1a` (after applying audit fixes)

## Process

Three parallel reviewer agents (edge-case hunter, coverage analyst, quality
reviewer) audited the changed tests and source:
`apps/api/src/modules/auth/bootstrap.service.test.ts`,
`apps/api/src/rpc/router.test.ts`, `apps/api/src/modules/auth/bootstrap.service.ts`,
against the acceptance criteria.

## Findings and disposition

| # | Agent | Finding | Disposition |
|---|---|---|---|
| 1 | Edge 🟠 | Missing key / wrong-typed value (`invalid_type`) mapped to "too long" message instead of "required" — misleads the direct-caller audience | **Fixed** — taxonomy now treats `invalid_type` as required; added `phone` to the required map; pinned with a missing-name test |
| 2 | Edge 🟡 / Quality | Message-map copy pinned for phone only | **Fixed** — added `it.each` pinning every per-field Arabic message (required + too-big variants) |
| 3 | Quality | `fieldErrors[].field` not asserted in the `it.each` rejection blocks | **Fixed** — each row now carries `field` and asserts it |
| 4 | Edge 🟡 / Coverage | Multi-field invalid input untested (zod reports all issues) | **Fixed** — added test asserting all three fields in one VALIDATION result |
| 5 | Quality / Edge | Boundary-exact valid inputs (name 120, password 8) untested | **Fixed** — added boundary acceptance test (serves criterion b) |
| 6 | Edge 🟡 | Whole-input type abuse (`null`/primitive) untested | **Fixed** — added non-object input test asserting root-level `input` field + no hash/port |
| 7 | Coverage | Whitespace-only password ≥8 chars passes schema | **Deferred** → #230 (shared schema policy, out of scope) |
| 8 | Coverage | Pre-existing "trims the display name" test subsumed by the new normalization test | **Kept** — harmless redundancy, minimal diff |
| 9 | Edge 🟡 | setupSecret whitespace-only / padded-correct / internal-whitespace variants | **Deferred** — behavior verified equivalent (trim ≡ old explicit trim); `""` edge already pinned; documented in PR |
| 10 | Edge 🟡 | Arabic-Indic digit phones fail the ASCII regex | **Pre-existing** — wire gate behaves identically; not a regression from this change; noted |

## Verdict

Coverage adequate for the acceptance criteria after the fixes:
- (a) reject blank/whitespace phone, empty/short password, empty name before
  hashing/port — per-field `it.each` with side-effect fence assertions + ordering
  test vs the setup-key gate + router wire-gate test (handler never invoked).
- (b) no behavior change for valid inputs — all pre-existing happy-path tests
  green; boundary acceptance + normalization tests added.
- (c) unit tests for rejection paths — 23 service-level rejection/normalization
  tests (31 in the file), all asserting the `VALIDATION` shape and the
  hash/port fence.

Full API suite after fixes: **657/657 pass**; lint clean; typecheck clean.
