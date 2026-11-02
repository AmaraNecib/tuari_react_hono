# #485 independent test audit

Source: 45bc97cc63fcb25c86be3e4c3d813d3bee2c17ca.
Tier: Standard. GPT-6 Luna high. Read-only, no test rerun.

Add a `{ timeZone: null }` case to the scanner test’s unpinned fixtures.

- **SHA reviewed:** `45bc97cc63fcb25c86be3e4c3d813d3bee2c17ca`
- **Severity:** Minor test-coverage gap
- **Location:** `tests/web-hygiene.test.mjs`, `date formatter scanner checks only effective timezone options`
- **Scenario:** `{ timeZone: null }` should be reported as unpinned. The scanner handles this in code, but no test currently locks in the stated null-rejection requirement.
- **Production defect found:** None.
