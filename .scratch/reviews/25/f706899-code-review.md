# Code review — issue #25 progressive disclosure (HEAD f706899)

Repo: tuari (local worktree). Base: `origin/develop` @ fbb7d02 (pinned by crew brief;
local `develop` ref is a stale ancestor — diff base is fbb7d02, branch is ahead 2).
Diff: `git diff fbb7d02...HEAD` (7 files, +737/-125) · commits: ff22d40, c098682, f706899.
Run as two parallel sub-agents (Standards / Spec) per `.agents/skills/code-review/SKILL.md`.
Read-only review; suites not executed by reviewers (run separately, see validation).

## Standards axis

**Correct**
- New primitive lives in `apps/web/src/components/ui/`; committed design doc matches AGENTS.md.
- All new keys (`debtSection`, `counterpartySection`, `defaultsSection`, `notesSection`) added to
  `ar.ts` and used via `t()` — passes the `check:i18n-keys` gate.
- RTL-safe: `text-start` + `gap`/`justify-between`, direction-neutral ChevronUp/Down, no `ltr:`/`mr-` leaks.
  A11y: `aria-expanded`/`aria-controls`/`role="region"` + `aria-labelledby`; conditional mounting keeps
  collapsed fields out of the a11y tree.
- #24 regression safety: seeding/XOR tests updated only to open the defaults section first; assertions untouched.
- No hard documented-standard violations.

**Judgement calls (baseline smells) — disposition**
| # | Smell | Finding | Decision |
|---|-------|---------|----------|
| 1 | Misleading comment | Page comment said section state "lives in the page component" — it lives in the primitive's `useState` | **Fixed** in f706899 (comment reworded) |
| 2 | Dangling aria-controls | `aria-controls` pointed at an unmounted region while collapsed | **Fixed** in f706899 (attribute set only when open) |
| 3 | Duplicated test noise | identical "10s budget" comment + `10_000` literal ×8 | **Fixed** in f706899 (`BASE_UI_TIMEOUT` const + hoisted `mockQueries()`) |
| 4 | Speculative generality | `description?: ReactNode` prop with zero callers | Kept (design doc declares it; section descriptions are expected API surface) |
| 5 | `@description Component` stub | Stray doc stub under real JSDoc | Kept — matches the repo-wide convention (same stub present across `components/ui`) |
| 6 | E2E serial module state | shared `itemName/warehouseName/counterpartyName` | Kept — `mode: "serial"` set; matches existing E2E specs |

Summary: 0 hard violations; worst was the misleading state-attribution comment — fixed.

## Spec axis

Spec source: crew brief for issue #25 + `.scratch/implementation/25-design.md`.

**Verified correct (evidence)**
- Essential path (number/date grid, line grids) always mounted and visible; E2E asserts all three with zero interaction.
- Section names match the brief verbatim: `الدين والدفع`, `ربط بجهة خارجية`, `المستودع والمشروع الافتراضي`, `ملاحظات وملفات` (ar.ts).
- #24 XOR intact: `setWarehouseId(id); if (id) setProjectId("")` + mirror moved verbatim; `validateForm`/`handleSubmit` untouched; line-level XOR unchanged; payload logic unchanged.
- State survives re-render: `CollapsibleSection` local `useState` + unconditional rendering; proven by unit tests and E2E step 4.
- Debt fields only when section opened AND is-debt=yes (unit tests + E2E selectOption("YES")).
- i18n-keyed + RTL-safe; all 4 new keys present in the only resource file.
- Tests per brief: collapsed/expanded, toggle survival, debt gating, essential-path E2E (count 0), full-create E2E with all sections expanded + DB seam.

**Findings**
1. (note) "Essential create path first": line grids render below the four section bars in DOM flow — the
   essential items are all visible without interaction; order is a literal-reading nuance, not a functional gap.
   Not changed: reordering the line grids above the header sections would break the add-buttons-in-header layout
   and hurt density. Documented here as accepted.
2. (note) `aria-controls` dangled while collapsed — **fixed** in f706899.
3. (note) page comment misattributed state location — **fixed** in f706899.

Summary: 0 blockers; worst was finding 1 (accepted by design intent: density + visible-essential-path).

## Validation after fixes

- `pnpm --filter @tuari/contracts build` ✓ (79ms build + DTS)
- `pnpm typecheck` ✓ (4 tasks, incl. web tsc --noEmit)
- `pnpm lint` ✓ (repo gates + eslint; fix commit ran pre-commit web-tracking/web-hygiene)
- `pnpm test:api` ✓ (71 files, 1254 passed)
- `pnpm test:web` ✓ (67 files, 571 passed)
- Playwright full suite ✓ (54/54) — rerun after review fixes (see test-audit + validation record)
- E2E invoice specs incl. attachment: ✓ (5/5, plus attachment DB-row pin)

Deferred (out of #25 scope; pre-existing, surfaced by edge-case review): debt paid-value bounds
(negative / >100% percent reach the API unvalidated, page:188-189), `validateForm` error-branch
coverage, `void handleSubmit()` unhandled-rejection on validation failure, fractional/overflow
quantity guards, `uploadInvoiceAttachments` unit assertion. See decision request in the handoff.