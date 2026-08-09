# Code Review — Issue #280 (debounce Ctrl+K search + lazy Fuse index)

- **Base:** `256f24a` (origin/develop merge-base)
- **Head:** `7c621ec14ece336c8dcc8b01fe613c696f374a00`
- **Diff:** `git diff 256f24a...HEAD` — 8 files, +581/-50
- **Tier:** Standard

## Standards axis

Reviewed against repo conventions (AGENTS.md, engineering-workflow, existing
app-shell patterns) + Fowler smell baseline.

- **Mysterious Name** — none. `useDebouncedValue`, `openSearch`, `closeSearch`,
  `getSearchQueryState`, `debouncedSearchQuery` are honest and self-documenting.
- **Duplicated Code** — none introduced. The corpus builders were *moved* into
  one `useMemo` (behavior-preserving); the flatten loop and Fuse options are
  unchanged byte-for-byte. The `{ enabled }` option pattern on the two
  inventory hooks mirrors the five existing `use*Query({ enabled: searchOpen })`
  call sites — consistent shape, no third copy of the logic.
- **Feature Envy / Message Chains / Middle Man** — none.
- **Primitive Obsession** — advisory: the 175ms debounce literal sits inline at
  the single call site with an explanatory comment. `useDebouncedValue(value, 175)`
  — a named constant is possible but adds nothing at one call site. Non-blocking.
- **Speculative Generality** — `useDebouncedValue<T>` is a 20-line hook whose
  generic T is exercised by the string call site; not speculative.
- **Shotgun Surgery / Divergent Change** — the diff is one coherent feature:
  shell (debounce + lazy gate), two hook signatures (enabled passthrough),
  fixture mock surface, tests, design doc. Each file changes for one reason.
- **Data Clumps / Repeated Switches** — none.

Repo-standard compliance: `useMemo` deps are complete (React compiler rules
honored: `searchOpen, t, searchQuery, debouncedSearchQuery, <7 query data>`);
no `any` added to production code; new hook file matches the `src/hooks/`
convention with JSDoc.

## Spec axis (issue #280)

Spec source: issue body + `.scratch/implementation/280-design.md`.

1. **"Debounce input 150–200 ms"** — ✅ 175ms trailing-edge debounce via
   `useDebouncedValue`; `fuse.search` now consumes `debouncedSearchQuery` so the
   per-keystroke hot path named in the issue (`:284` `fuse.search(searchQuery)`)
   runs only after the user pauses typing.
2. **"Build the Fuse index lazily — only when the dialog opens"** — ✅ corpus +
   index construction is gated behind `searchOpen` (early return while closed);
   no `Fuse` instance exists while the dialog is closed.
3. **"Search also forces the shell to fetch the entire workspace eagerly"** — ✅
   `useInventoryItemDefinitionsQuery` / `useInventoryInvoiceGroupsQuery` gained
   `{ enabled }` (routed through the existing `useWorkspaceScopedQuery` seam) and
   are now `enabled: searchOpen`; all 7 corpus queries are disabled while closed.
4. **"Consider server-side search for large datasets later"** — deferred by
   design; documented in the design doc and PR body (out of scope).
5. **Scope check** — the only additions beyond the three fixes are
   `setSearchQuery("")` on open/close, which the debounce *requires* (prevents a
   stale-result flash when reopening within the debounce window) and is
   explicitly tested. No other behavior change.

## Verdict

- Standards: 0 hard violations, 0 actionable findings (1 advisory: literal
  constant, non-blocking).
- Spec: 0 missing requirements, 0 scope creep, 0 mis-implementations.
- **No actionable findings.** Safe to push.

---

## Post-evidence delta (16bc3d7 — Greptile fix round)

Greptile (4/5) raised two valid findings on `home-view-signed-in-shell.tsx`;
both were fixed and re-verified:

1. **Stale debounce survives rapid close/reopen** — `useDebouncedValue` gained
   an optional `resetKey`; the shell passes `searchOpen`, so the debounced
   value is flushed synchronously whenever the dialog (re)opens. A rapid
   reopen can no longer show the previous query's results beneath a newly
   typed query. Regression test added: "rapid close/reopen never leaks the
   previous query's results" (fake timers, types immediately after reopen).
2. **Raw query rebuilt the Fuse index per keystroke** — the combined memo
   included `searchQuery` in its deps, reconstructing corpus + index on every
   keystroke. Split into (a) a corpus+index memo keyed only on
   `searchOpen, t, <7 query data>` and (b) a cheap results memo keyed on
   `searchOpen, searchQuery, debouncedSearchQuery, fuse, allSearchItems` —
   index construction now only happens when data changes while open.

Hook unit test added: "flushes the current value synchronously when the reset
key changes". Full pipeline re-run: typecheck ✓, lint ✓, test:web 389 ✓,
E2E search spec ✓.
