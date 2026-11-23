## vitest 4 hoists vi.mock factories above top-level consts: use vi.hoisted for new mocks (🟡 Minor)

On #35 a new page test mocked `@/lib/orpc-client` with a factory referencing a
top-level `const mockEmployeesGet = vi.fn()` and vitest 4 failed at import:
`ReferenceError: Cannot access 'mockEmployeesGet' before initialization`. The
legacy `edit-page-resync.test.tsx` pattern (top-level consts referenced from
factories) still passes because those mocks' factories happen to run after
module init, but vitest 4's hoisting makes the order unsafe for modules
imported at startup. Fix: `const { mockA, mockB } = vi.hoisted(() => ({ mockA:
vi.fn(), mockB: vi.fn() }))`, then reference them in factories. This is the
documented Vitest-4-safe shape; keep new test files on it even when the legacy
file still works.

**Always**: when writing a new `vi.mock(...)` factory for a module the page
imports at startup, declare the referenced mocks via `vi.hoisted` — do not
copy the old top-level-const pattern from `edit-page-resync.test.tsx`.

