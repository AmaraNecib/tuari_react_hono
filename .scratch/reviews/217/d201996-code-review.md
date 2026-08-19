# Code Review — #217 dashboard view-model seam (Standards + Spec)

- **Mode:** local-only
- **Base:** `6be3497` (cached origin/develop, pinned by issuer)
- **HEAD reviewed:** `d201996` (final)
- **Tier:** Standard (code-review required)
- Spec source: issuer brief (local-only; GitHub issue #217 body unavailable).
  Parent/map context: #211.

Commits (`6be3497..d201996`):
- `53b6b53` refactor(web): deepen dashboard view-model seam (#217)
- `28f7521` test(web): cover seam fallback paths in dashboard composition test (#217)
- `d201996` refactor(web): name the seam row builder buildEmployeeTableRow (#217)

## Standards axis
Ran as a parallel sub-agent (Standards + Fowler smell baseline).

- Source-only staging and lifecycle (design-before-code, composition test)
  conform to `docs/engineering-workflow.md` / `AGENTS.md`. ✓
- No hard violations of documented standards; eslint/tsc clean.
- Removed a stray generated doc fragment (`/** buildManagerOptions({ component. */`)
  embedded mid-type — a welcome cleanup consistent with the file's known noise.
- Smell judgement calls: `lookups` + `relationshipFacts` + `copy` + `t` bundle
  is now hidden behind the seam row builder (deep module; removes a potential
  Data-Clump reach-in rather than adding one). No Duplicated Code, Feature
  Envy, Speculative Generality, Middle Man, Message Chains, Shotgun Surgery,
  or Divergent Change.
- **Resolved finding (judgement call):** the seam property was initially named
  `buildEmployeeRow`, which could be confused with the internal four-arg
  `buildEmployeeRow` helper (same noun). Renamed the seam property to
  **`buildEmployeeTableRow`** (it returns exactly an `EmployeeTableRow`),
  eliminating the cross-scope collision.

**Standards summary:** 0 hard violations, 0 blockers; 1 low judgement call
(Mysterious Name) — fixed by rename.

## Spec axis
Ran as a parallel sub-agent against the issuer brief.

Issuer brief: "make buildHomeViewDerived (and HomeViewDerived) the single
public seam for the dashboard's derived data; kill the reach-in from
employees-section; add one composition test. Overlap guard: avoid
table/pagination primitives."

| Criterion | Status |
|-----------|--------|
| buildHomeViewDerived/HomeViewDerived is the single public seam | ✅ satisfied — seam exposes `buildEmployeeTableRow`; `HomeViewDerived = ReturnType<...>` carries it |
| reach-in from employees-section killed | ✅ satisfied — `employees-section.tsx` imports no `home-view-derived-*` module; consumes the injected `buildEmployeeTableRow` prop; dead `workspace`/`noManagerLabel`/`noProjectLabel` props removed |
| one composition test | ✅ satisfied — `home-view-derived-composition.test.ts`, exactly one `it()`, imports only the public seam + copy builder |
| no table/pagination primitives touched | ✅ satisfied — diff touches no `table`/`pagin`/`app-shell-table` files |

- Missing/partial requirements: none.
- Scope creep: none — prop removals and the optional `relationshipFacts` param
  are direct consequences of killing the reach-in / de-duplicating facts.
- Implemented-wrongly: none (all 4 criteria verified against the diff).

**Spec summary:** 0 findings; all 4 acceptance criteria satisfied.

## Freshness note
Evidence regenerated at final HEAD `d201996`; the only delta from the earlier
reviews (`28f7521`) is the behaviour-preserving seam-property rename.
