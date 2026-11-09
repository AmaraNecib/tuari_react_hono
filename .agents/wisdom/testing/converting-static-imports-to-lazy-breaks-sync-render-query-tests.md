## Converting static imports to lazy() breaks sync render/query tests (🟠 Major)

After #286 made all eight workspace sections `lazy()` behind Suspense, existing
`render` + `getBy*` tests failed: sections now render asynchronously, so the DOM
isn't populated on the first synchronous tick. Fix pattern: switch to
`findBy*`/`waitFor` for anything behind a lazy boundary and raise
load-sensitive timeouts; fixture mocks must cover the de-barreled module hooks
(the `mock-dashboard` barrel became direct imports, so the test-utils fixture
mocks had to change too). `test:web` 375/375 after the fix.

**Always**: when a component tree starts lazy-loading, grep its tests for sync
`getBy*` queries against lazy content and convert them to `findBy*`; assert on
stable vendor filenames across TWO clean builds before claiming long-term
caching in a PR.


