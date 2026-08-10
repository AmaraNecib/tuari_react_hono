# Test Audit — Issue #282 (web hygiene)

**Base SHA:** `03ec349643901a2802338d8e19b730b28e5eb841`
**Head SHA at audit time:** `aa220d676b3c4bcc4d0524a8c495221ad9adc353`
**Tier:** STANDARD
**Auditors:** 3 parallel sub-agents (edge case hunter / coverage analyst / quality reviewer)

## Scope audited

New tests for issue #282 (web hygiene chore):

- `apps/web/src/web-hygiene/dependencies.test.ts`
- `apps/web/src/web-hygiene/prod-html.test.ts`
- `tests/e2e/web-hygiene.spec.ts`

Changed source: `apps/web/index.html`, `apps/web/package.json`, `apps/web/vite.config.ts`,
`apps/web/src/components/ui/alert-dialog.tsx`.

## Verdict

**No 🔴 blockers.** All 4 acceptance criteria (prod HTML clean, 6 dead deps gone,
shadcn in devDependencies, named radix imports) have at least one direct regression
test. Quality grade: **A**. One 🟠 robustness bug and several 🟡 hardening items —
all fixed in commit `bb2a05f` (below).

## Findings and fixes applied

1. **🟠 `beforeAll` hook timeout (real bug on fresh worktrees)** — vitest's default
   hook timeout is 10s, but a cold `@tuari/contracts` build takes ~12s; on a fresh
   worktree with an empty `packages/contracts/dist`, the guard build would exceed
   the hook timeout and fail. **Fix:** `beforeAll(..., 120_000)`.
2. **🟡 Vacuous-pass risk (absence-only assertions)** — both prod-html tests only
   asserted absence; a truncated/emptied artifact would pass. **Fix:** positive
   controls — `index.html` must contain the `/src/main.tsx` entry, `dist/index.html`
   must contain `<div id="root"></div>` and a hashed `/assets/index-*.js` module
   script; `dependencies.test.ts` pins `@radix-ui/react-alert-dialog` still declared.
3. **🟡 `shadcn` version pin `^4.0.5` exact-string brittle** — a legitimate future
   upgrade would trip a hygiene test. **Fix:** loosen to `/^\^4\.\d+\.\d+$/` (the
   property under test is *where* the CLI lives).
4. **🟡 Lockfile never asserted** — package.json absence alone misses a stale
   `pnpm-lock.yaml` entry surviving a bad merge. **Fix:** assert none of the 6
   removed packages appear in `pnpm-lock.yaml` (`(^|\s)<name>@` per line).
5. **🟡 manualChunks check matched one syntactic form** — **Fix:** whole-file
   `not.toContain(dep)` (strictly stronger).
6. **🟡 E2E late-request window / mount proof** — **Fix:** add `page.on("websocket")`
   capture (covers the reconnect-loop vector), assert `#root` is non-empty (proves
   the React app actually mounted — `html[lang=ar]` is static HTML and proves
   nothing), lowercase-normalize content and URLs (hostnames are case-insensitive).
7. **🟡 Case-sensitivity of marker checks** — **Fix:** `.toLowerCase()` on both
   sides in unit tests too.

## Deferred / accepted (not fixed)

- **Contracts `beforeAll` parallel-worker race** — only one file in the suite runs
  `vite build`, so only one worker executes the guard build; no real contention
  today. A `.building` marker lock was deemed over-engineering for a single caller.
- **Source-grep "zero imports" guard for the 6 deps** — package.json + lockfile +
  manualChunks checks pin the post-fix contract; a dead-code import grep was
  verified manually pre-fix per the design doc and is not re-tested.
- **E2E runs against the vite dev server, not the prod build** — the prod-build
  property is pinned by the real `vite build` unit test (documented limitation).

## Validation performed

- `pnpm --filter @tuari/web exec vitest run src/web-hygiene` → 2 files, 7 tests passed
  (includes a real `vite build`; ~2–14s).
- `pnpm exec playwright test tests/e2e/web-hygiene.spec.ts` → 1 passed; mutation
  test confirmed the spec fails when the markers are re-injected into `index.html`
  and passes after removal.
- `pnpm typecheck` + `pnpm lint` → clean after the audit fixes.
- First hardened E2E attempt failed against an orphaned stale vite dev server
  (Windows orphan poison, known issue — see `.agents/wisdom/testing.md`); after
  killing the orphan tree the spec passes. Not a code defect.
