## Test mocks that return the fallback mask missing keys (🟠 Major)

`vi.mock("react-i18next")` mocks like `t: (key, fallback) => fallback ?? key`
(in update-section.test.tsx) or `if (!fallback) return key` (license-settings)
let tests pass while production rendered raw keys. The mock "translated" via
the inline fallback. After promoting fallbacks into the real resource and
stripping redundant ones, these tests broke (mock now returned the key). Fix:
mock `t` to resolve against the real resource object (`ar.translation`), so
resource wins and fallback only applies when missing, mirroring production
i18next. That also makes the tests validate the RESOURCE, catching drift.

**Always**: when a test mocks `t`, resolve against the real resource instead of
echoing the fallback; otherwise the test suite is blind to missing keys.

