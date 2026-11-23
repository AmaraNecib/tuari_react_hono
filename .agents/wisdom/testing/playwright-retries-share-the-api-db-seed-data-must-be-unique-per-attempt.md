## Playwright retries share the API DB: seed data must be unique per ATTEMPT (🟠 Major)

CI sets `retries: 2`; a retried test re-runs against the SAME API server and DB (webServer runs once per process). Seeding fixed phone numbers (sqlite UNIQUE constraint) throws on the second attempt. Fix: derive seed values (phones, names) from the per-call `uniqueSuffix()`, not constants. **Always**: any E2E row inserted directly into the shared DB must be unique per test ATTEMPT, not just per run.

