# Issue #281 — code-review evidence

**Head SHA:** `2c4946b`
**Base:** `03ec349` (origin/develop)
**Review:** code-review skill, two parallel `reviewer` sub-agents (Standards + Spec)
**Result:** no blockers; 2 note-level Standards findings, 4 note-level Spec findings — all advisory.

---

## Standards

No `CODING_STANDARDS.md`/`CONTRIBUTING.md` exist. `docs/engineering-workflow.md`
(tests + verification per change) is satisfied: new Playwright E2E spec + hygiene-test
pins; sub-agent independently verified `pnpm check:web-hygiene` (7/7) and
`pnpm --filter @tuari/web build` (pass). Parent additionally ran full suite:
`lint`, `typecheck`, `test:web` 398/398, `test:api` 1006/1006, full E2E 24 passed /
2 skipped, build with 22 subset-trimmed woff2 emitted.

Baseline smells (all judgement calls, none blocking):

1. **Duplicated Code (note)** — the 7-family contract is enumerated in both
   `tests/e2e/fonts.spec.ts` and `tests/web-hygiene.test.mjs`. Intentional
   cross-layer pinning (unit-level static guard vs browser-level registration);
   the two assert differently and intentionally.
2. **Duplicated Code (note)** — `styles.css` latin/latin-ext `unicode-range`
   blocks are byte-identical for Inter Tight and JetBrains Mono. Declarative
   font-face data copied from the fontsource package; kept explicit for reviewability.
3. **Design-doc drift (note)** — design doc's E2E description vs final test
   assertions. Fixed in `.scratch/implementation/281-design.md` (commit after review).

## Spec

Issue #281 body (verbatim targets): *"drop the Google Fonts `<link>` + preconnects
entirely"*, *"Self-host Inter Tight / IBM Plex Sans Arabic via @fontsource"*,
*"Add preload for the Arabic woff2"*.

Verified correct: index.html drops both preconnects + the Google stylesheet; zero
`googleapis`/`gstatic` references remain in `apps/web/src`; all 7 families declared
(6 via @fontsource subset imports / hand @font-face + Noto Sans Arabic Variable
fallback); tokens renamed to fontsource-registered family names; every referenced
woff2 exists in the pnpm store; hygiene pins + E2E added.

Findings (all advisory):

1. **Preload target differs from the issue's wording (note)** — issue says
   *"the bundled Arabic woff2"* (Noto Sans Arabic Variable); `fonts.ts` preloads
   **IBM Plex Sans Arabic arabic-400**. Deliberate: IBM Plex is first in the
   `--font-arabic` stack and renders first-paint Arabic body text; the bundled
   Noto file is a rarely-reached fallback, so preloading it would force a 162 KB
   download that never renders. Verified in the E2E that IBM Plex reaches
   `status: loaded`.
2. **Noto Naskh Arabic kept at 400/700 only (note)** — Google's request listed
   400;500;600;700; 500/600 now synthesize. Noto Naskh is a fallback serif reached
   only when Amiri lacks a glyph; faux-weight there is invisible. Accepted tradeoff
   for the size reduction the user requested.
3. **Subset/weight trimming exceeds the issue's stated fix (note)** — sanctioned:
   the user explicitly asked to compact file sizes without data loss; the design
   doc records the trimming table (per-family kept vs dropped subsets, with sizes).
4. **`/preconnect/i` hygiene pin is brittle (note)** — a future legitimate
   preconnect would trip it. Acceptable: it pins the regression the issue is about;
   cheap to revisit if a real preconnect is ever added.

## Verdict

**No actionable findings on either axis.** All items are advisory notes, most of
which are intentional, documented decisions. Safe to proceed (push/PR pending user
direction — GitHub review trigger intentionally NOT fired per user instruction).

## Post-review delta

- `.scratch/implementation/281-design.md` — E2E description corrected to match the
  final assertions (design-doc drift finding).
