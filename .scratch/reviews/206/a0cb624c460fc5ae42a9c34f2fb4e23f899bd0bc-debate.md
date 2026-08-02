# Debate — Issue 206 (e12194e)

Base SHA: `80d4926` · Head SHA: `e12194e` · Tier: **High-assurance** (change touches the `security.ts` recovery-key / DB-key contract surface; upgrade from Standard for conservatism)

## Process

Two parallel sub-agents (harsh critic + charitable defender) reviewed
`git diff 80d4926...e12194e`, the changed files, `security.ts`,
`system-contract.ts`, the consumers (`handlers/system.ts`, `handlers/reports.ts`),
and the design doc.

## Critic findings → disposition

| # | Finding | Sev | Disposition |
|---|---|---|---|
| 1 | Wholesale `export *` widens the public API beyond the 4 needed schemas (also exposes `changeAppPasswordInputSchema`, `recoveryKeyPoolStatusSchema`, `reportsContract`, …) | 3 | **Dismissed** — matches the house pattern (`invoice-contract`, `payment-contract`, `update-contract`, `rbac-contract` are all re-exported wholesale) and the issue's explicit instruction to re-export `./security` wholesale. A named-export subset would be inconsistent with the index's structure. |
| 2 | Recovery-key / DB-key schemas accept whitespace-only secrets (`"   "` passes `min(1)`; 8 spaces pass `min(8)`) — now public contract surface | 2 | **Deferred** → GitHub issue **#221** (behavior change out of #206 scope; no live bypass today — whitespace keys can't match stored hashes). |
| 3 | `changeDbKeyOutputSchema` permits logically invalid combos (`{success:false}` without `error`; `{success:true, error}`) — now public | 2 | **Deferred** → GitHub issue **#221** (handler only emits valid pairs; encode invariant via `z.discriminatedUnion`). |
| 4 | Schemas imported as values but used only in type position (`z.infer<typeof …>`) | 1 | **Dismissed** — pre-existing house style (every other schema import in `handler-inputs.ts` is a value import); changing only these four would be inconsistent. |
| 5 | Latent `exactOptionalPropertyTypes` fragility for `ReportFilterInput` | 1 | **Dismissed** — documented in the design doc; flag is off repo-wide; derived type is structurally identical today. |

## Defender verdicts (all design decisions upheld)

| Decision | Confidence |
|---|---|
| Index re-export of `./reports-contract` (beyond issue's literal wording) is the completion of the goal — without it the exported const is unreachable from `@tuari/contracts` | 8/10 |
| `z.infer` derivation is definitionally drift-free; a type-equality "drift test" would be a tautology (the mirror is what the change eliminates) | 10/10 |
| `export const reportFilterInputSchema` in place — minimal, colocated with the contract it gates, mirrors `security.ts` | 10/10 |
| Test strategy (contracts unit + router ORPC wire tests, no Playwright E2E) — E2E would test the untouched service/DB layer; `SecuritySection` is unmounted, no wired UI flow exists | 9/10 |

## Outcome

No blockers, no majors in scope. Zero changes required from this debate.
Deferred items tracked in #221. Evidence files: this + test-audit + code-review.

---

**Post-evidence delta (a0cb624):** commits since e12194e are (1) the GitHub-hosted runner migration `42410f7` — byte-identical copy of the change merged in PR #224 (`f362858`), verified `git diff 42410f7 f362858` empty and `git diff HEAD origin/develop -- .github/workflows/ci.yml` empty; and (2) merge of origin/develop (`a0cb624`), which introduced zero feature-file changes (verified `git log 80d4926..HEAD -- apps/api packages/contracts` shows only b60b6c1 + e12194e). Final-diff code-review re-run (Standards + Spec) found no drift and no new issues. Evidence validity at a0cb624 confirmed.
