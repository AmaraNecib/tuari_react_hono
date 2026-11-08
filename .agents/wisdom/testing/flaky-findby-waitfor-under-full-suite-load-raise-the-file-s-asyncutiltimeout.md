## Flaky findBy* / waitFor under full-suite load: raise the file's asyncUtilTimeout (🟠 Major)

`home-view.test.tsx` flaked ~50% under full-suite parallel load (passed standalone
always) with `Unable to find role="heading" ...`. Testing-library's default 1s
async wait was exceeded by slow renders. Per-call `{ timeout: 5000 }` on each
finder is noisy and easy to miss; the canonical fix is one line at the top of the
file: `configure({ asyncUtilTimeout: 5000 })` (import `configure` from
`@testing-library/react`). It sets the default for BOTH `findBy*` (built on
`waitFor`) and bare `waitFor` calls, is module-scoped under vitest's per-file
isolation, and future calls inherit it. Note: an existing explicit `{ timeout:
5000 }` becomes redundant but harmless. Leave it to keep the diff minimal.

**Always**: for a whole-file async-wait timeout problem, use `configure({ asyncUtilTimeout })`
rather than scattering per-call timeouts; validate with 2-3 consecutive full-suite
runs (the flake may not reproduce standalone).

