# Scoped test selection — design

Ticket: `#scoped-test-selection` (local work item; no GitHub issue body — the
lane brief is the spec).
Base SHA: `0da0a2759cf68bca6f972ca3de31df8a2842919d` (`origin/develop`).
Mode: remote repo, local-only delivery (lane never pushes or opens a PR).
Review tier: Standard (CI config + workflow + test tooling).
Branch: `chore/scoped-test-selection`.

## Problem

`.husky/pre-push` ran `contracts build && typecheck && lint && test:api &&
test:web` for every push. A web-only diff paid the whole API suite, which flaked
with 17 failures in the known SQLite cluster (#432). CI's `dorny/paths-filter`
already gates the API/web/e2e *jobs* by area, but once the e2e job fires it runs
the whole Playwright suite. Neither gate asks "which spec can this diff actually
reach?".

## Shape

One checked-in artifact and one dependency-free reader. No model and no human
judges the diff; the diff is an input, the map is source, and a path the map
does not know is a *cost* (full suite), never a coverage hole.

```
tests/e2e-selection.map.json     # path globs -> Playwright spec names
scripts/ci/e2e-selection.mjs     # selector + CLI (e2e scope | area scope)
tests/e2e-selection.test.mjs     # unit tests + anti-rot test
.husky/pre-push                  # scoped gate, fail closed
.github/workflows/ci.yml         # e2e job uses the selector on the PR diff
```

### Map sections

- `always_full` — critical/shared paths. Any hit means run the whole suite.
- `skip_e2e` — no browser surface (docs, `.github`, `.agents`, `.scratch`,
  markdown, local scripts/config).
- `features` — `{ match: [globs], specs: [names] }`. A shared surface whose
  blast radius spans features (`apps/web/src/components/**`) is a feature rule
  that fans out to every consuming feature's specs, so a shared-control change
  routes the screens that use it instead of a single guessed owner.
- `always_specs` — cross-cutting specs (boot, fonts, splashscreen, web hygiene)
  that join every `affected` run. They are the wiring home for specs that do not
  belong to a single feature, so the anti-rot test can prove every spec is
  reachable.

### Selector outcomes

- `full` — empty diff, a critical path, or an unmapped path. Fail closed.
- `affected` — a feature rule matched; specs are that rule plus `always_specs`.
- `skip` — every changed file matched `skip_e2e` only.

Precedence per file: critical > feature > skip > unmapped. A feature match beats
a skip match so a broad inert pattern cannot swallow a real screen.

### Selector interface

`selectSpecs(changed: string[], map?): Scope` — Playwright scope.

`selectAreas(changed: string[], map?): { gate, api, web, e2e_mode, e2e_specs,
reason }` — the pre-push decision. `gate` is `full` exactly when the e2e scope is
`full`, so an unknown/critical/empty diff forces the complete gate.
`api`/`web` are `1`/`0` for whether `test:api` / `test:web` must run:

- `api=1` iff `apps/api/**`, `packages/contracts/**`, or a workspace/root
  config/manifest changed.
- `web=1` iff `apps/web/**`, `packages/contracts/**`, or a workspace/root
  config/manifest changed.
- `e2e_specs` is space-separated `tests/e2e/<name>` for `affected`, empty
  otherwise.

CLI: `node scripts/ci/e2e-selection.mjs --mode e2e|areas --files <list>`, or the
list on stdin (`\r?\n` separated). `--mode e2e` writes `mode=`, `specs=`,
`reason=` so it can be appended straight to `$GITHUB_OUTPUT`.

## Pre-push gate

```
derive pushed files (hook stdin local_sha vs remote_sha / merge-base develop)
  -> node scripts/ci/e2e-selection.mjs --mode areas

gate=full                => contracts build && typecheck && lint && test:api && test:web
gate=scoped              => contracts build && typecheck && lint
                            && [api=1] test:api
                            && [web=1] test:web
                            && [e2e scheduled] mapped playwright specs
```

Root hygiene/unslop stay on every path because `lint` is cross-cutting and never
scoped. Only the suites the diff can reach are scoped. The fail-closed rule is
documented in the hook.

## CI

`test-e2e` keeps its `detect.outputs.e2e` area gate and the manual-dispatch
run-everything escape hatch. On a PR it computes the changed files with
`git diff origin/<base>...HEAD` and runs the selector:

- `full` -> `pnpm test:e2e` (whole suite).
- `affected` -> `pnpm test:e2e <mapped specs>`.
- `skip` -> no Playwright run; the required check still reports from a no-op
  step.

## Tests

`tests/e2e-selection.test.mjs` (node:test):

- `globToRegExp` semantics for `**`, `*`, `?`.
- critical beats skip, feature beats skip, unmapped => full, empty => full,
  skip-only => skip, `always_specs` joins an affected run but not a skip.
- area scope: a mapped web-only diff is `web=1 api=0`; a docs-only diff is
  `skip`; an empty diff is `full`.
- anti-rot: every `tests/e2e/*.spec.ts` is declared by a feature rule or
  `always_specs`; every declared spec exists; every feature rule is non-empty.

## Risks

- The map can rot. The anti-rot test makes a new unwired spec fail CI.
- A mapped feature can still fan out wider than its rule. Genuinely critical
  shared code lives in `always_full`; the shared UI primitives under
  `apps/web/src/components/**` are a fan-out feature rule that names every
  consuming feature's specs. Both degrade to coverage, never to silence.
- Pre-push e2e needs local servers/ports. The hook runs the mapped subset only;
  a mapping miss is caught by the fail-closed full run in CI.
