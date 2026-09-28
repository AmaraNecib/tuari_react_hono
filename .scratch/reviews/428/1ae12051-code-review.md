# #428 code review — `1ae12051a16110ebc5d8081e0ea74ff7243aa090`

Lane self-review against the pinned base (a sub-agent review was not run; the
brief scopes review ownership to the parent and excludes a Greptile request).

## Standards axis

- Touched only `apps/web` source/tests plus the `.scratch/implementation/` design
  doc. No config, lockfile, generated artifacts, or unrelated files.
- New component test replaces the old adapter test (`.test.ts` → `.test.tsx`) and
  drives the real picker; no second copy left behind.
- Screen-test mocks use `vi.hoisted` (the vitest-4-safe shape from
  `.agents/wisdom/testing.md`) and `importActual` spreads so unmatched exports
  stay real.
- Reuses the existing `toAlgeriaDayBoundaryIso` seam; no new date utility.
- No `git add -A`; explicit staging; no reviewable whitespace noise.
- Comments state the contract and the "why" (canonical day is the app seam).

Potential standard concerns considered and dismissed:

- The design doc says `parsePickerValue` accepts `dd/MM/yyyy` defensively. That
  is intentional compatibility, not a second convention: it is not exported and
  the only output is canonical.
- `parsePickerValue`'s empty-value early return is unreachable through the
  component (which guards `value ?`). Kept as harmless defense; line coverage is
  still 100%.

## Spec axis (issue #428)

| Acceptance criterion | Status |
| --- | --- |
| Audit EVERY `DatePicker` usage, verdict each | Done — 16 call sites in the design doc table; 14 broken, 2 correct via the old bridge |
| Fix broken ones, one convention only | Done — component contract inverted to canonical in/out with internal normalization; `toDatePickerValue`/`fromDatePickerValue` deleted and expense call sites reverted to direct canonical |
| Test per fixed screen asserting submitted value | Done — listed in the verification evidence |
| Consider a guard against the class returning | Done — contract inversion closes the wrong-literal class by construction; component + screen tests pin it. A `yyyy-MM-dd`-literal lint was deliberately not added because after the inversion that literal is the correct input |

## Findings

None blocking. Residuals are recorded in the design doc's Risks section.
