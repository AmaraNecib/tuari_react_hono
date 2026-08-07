# Issue 254 — Playwright E2E: admin account lifecycle (bootstrap → profile → change password)

**Tier:** Standard (E2E test code + one shared helper tweak)
**Base:** `origin/develop` @ `fd94c41`
**Branch:** `refactor/issue-254-admin-account-e2e`

## Problem

The existing E2E specs use the bootstrap flow **as a setup helper**
(`bootstrapOrSignIn` in `tests/e2e/helpers/session.ts`, local `bootstrapIfNeeded`
in `foundation-smoke.spec.ts`) but never test the admin account lifecycle
itself end-to-end. This issue adds a dedicated spec covering:

1. First-run bootstrap creates the admin account
2. Admin signs in with phone + password
3. Admin edits their profile (name/phone)
4. Admin changes their password
5. Sign-in with the new password works; old password fails

## Key design decisions

### 1. Fresh-DB bootstrap is deterministic because the spec sorts first

The whole suite shares one timestamped SQLite DB per run
(`./data/tuari.phase1.integration.<ts>.sqlite`, `playwright.config.ts`),
created fresh by the API webServer at the start of a run. `workers: 1` and
`fullyParallel: false` run spec files sequentially, and Playwright collects
test files with `entries.sort((a, b) => a.name.localeCompare(b.name))`
(verified in `playwright/lib/runner/projectUtils.js`).

`admin-account.spec.ts` sorts **before** `debts/employees/foundation-smoke/
inventory/projects/recovery-keys/warehouses`, so it is the first file to touch
the DB → the bootstrap test sees a guaranteed-fresh DB.

### 2. The spec must restore canonical credentials (suite integrity)

Later specs sign in via `bootstrapOrSignIn` with `TEST_PHONE` / `TEST_PASSWORD`
(`tests/e2e/helpers/session.ts`). The profile and password-change tests mutate
those identifiers, so each test restores them before finishing:

- **Profile edit** — the settings form bundles sensitive changes: `handleSave`
  in `settings-section.tsx` treats a filled current-password with an empty
  new-password as an *incomplete password change* (validation error
  `accountPasswordNewRequired`), so changing the phone (which the account
  service gates behind the current password) is only possible through the UI
  together with a new password. The test therefore changes name + phone +
  password (TEST → NEW), asserts the new name/phone in the sidebar and form,
  then restores all three (NEW → TEST) via the same UI. This is the real user
  flow — not an artificial workaround.
- **Password lifecycle** changes password → verifies old fails / new works →
  changes it back to `TEST_PASSWORD` via the same UI → signs in with
  `TEST_PASSWORD` as the final proof.

This doubles coverage of the change flows (the "restore" is the same UI path)
and keeps every downstream spec green.

### 3. Playwright isolates browser contexts per test

Each `test()` gets a fresh context (no shared cookies/localStorage), so every
test starts unauthenticated — the sign-in steps are real sign-ins, not leftover
sessions. The spec uses `test.describe.configure({ mode: "serial", retries: 0 })`
(shared DB state + mutated credentials; retries would re-run against mutated
state, same rationale as `recovery-keys.spec.ts`).

### 4. Reuse existing session helpers where the flow is not the subject

`bootstrapOrSignIn` is used in the profile/password tests to reach the signed-in
shell (the bootstrap *helper* is fine there — the *flow* is the subject in
tests 1 and 2, which write the UI steps explicitly).

The tour-dismissal `addInitScript` inside `bootstrapOrSignIn` is extracted into
an exported `dismissUserJourneyTour(page)` helper in `session.ts` so the spec's
raw sign-in steps (after password change / after sign-out) dismiss the overlay
too, without duplicating the localStorage key comment.

## Test plan (`tests/e2e/admin-account.spec.ts`)

| # | Test | Steps | Assertions |
|---|------|-------|-----------|
| 1 | first-run bootstrap creates the admin account | goto `/`, fill name/phone/password, click "إنشاء الحساب الأول" | heading "إنشاء المستخدم الأول", then dashboard link "لوحة التحكم" visible; sidebar footer shows `TEST_NAME` + `TEST_PHONE` |
| 2 | admin signs in with phone + password | goto `/` (fresh context, already bootstrapped), fill phone/password, click "دخول إلى مساحة العمل" | sign-in heading "تسجيل الدخول" before; dashboard after |
| 3 | admin edits profile (name/phone) | `bootstrapOrSignIn` → settings → account tab → change name to `EDIT_NAME`, phone to `EDIT_PHONE`, current password → save | success toast "تم تحديث بيانات الحساب بنجاح."; sidebar shows new name/phone; form values update; then restore → assert restored |
| 4 | admin changes password; new works, old fails | `bootstrapOrSignIn` → settings → current `TEST_PASSWORD` + new `NEW_PASSWORD` → save → sign out → sign in with old → **error** "رقم الهاتف أو كلمة المرور غير صحيحة." → sign in with new → dashboard → change back to `TEST_PASSWORD` → sign out → sign in with `TEST_PASSWORD` → dashboard | toast on save; inline auth error on old-password attempt; dashboard with new password; final dashboard with `TEST_PASSWORD` |

Constants (validated against `algerianPhoneSchema` `/^(05|06|07)\d{8}$/` and
password 8–128 chars):
- `TEST_PHONE = "0612345678"`, `TEST_PASSWORD = "password123"`, `TEST_NAME = "مدير التشغيل"` (from `session.ts`)
- `EDIT_NAME = "مدير التشغيل التجريبي"`, `EDIT_PHONE = "0771234567"`
- `NEW_PASSWORD = "e2e-new-pass-123"` (16 chars)

## Dependencies / touched files

- `tests/e2e/admin-account.spec.ts` — **new**
- `tests/e2e/helpers/session.ts` — extract + export `dismissUserJourneyTour` and `signIn` (used by `bootstrapOrSignIn` and the new spec)
- `apps/api/src/modules/account/account.repository.ts` — **bug fix** (see below)
- `apps/api/src/app/dependencies.ts` — pass the raw sqlite handle to `DrizzleAccountRepository`
- `apps/api/src/modules/account/sqlite-account.repository.test.ts` — **new** regression tests
- `apps/api/src/modules/account/account.service.test.ts` — add 401/409/same-phone coverage

No production behavior change beyond the transaction fix. No playwright.config change
(ordering is default).

## Bug found & fixed (why production code changed)

The E2E spec exposed a real bug: `DrizzleAccountRepository.withTransaction` used
Drizzle's `db.transaction(async ...)` against better-sqlite3, which is sync-only
— every async profile update threw `Transaction function cannot return a promise`
(500). Unit tests never caught it because `account.service.test.ts` mocks the
repository and app tests run with `DB_ADAPTER=inmemory`. The fix ports the
repo's established pattern (SqliteRecoveryKeyPort, wisdom #195): constructor
takes the raw handle (asserts same connection), FIFO promise-chain lock, and
`withTransaction` owns `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` with an
`inTransaction` nesting check.

Test-audit additions (from the 3-agent audit): wrong-current-password negative
path in the E2E profile test; `.first()` on toast assertions to avoid the sonner
dismiss-timer race; repo tests for concurrent FIFO-lock serialization, inner-
throw inside an outer tx (outer must keep ownership), missing-user rollback,
`passwordChanged` flag mapping; service tests for the 401 and 409 branches.

### E2E flake found & fixed during validation (toast race)

A ~50% flake: after a password change, the follow-up sign-out sometimes left the
app signed in despite a 200 `/api/auth/sign-out`. Root cause: the success-toast
assertion used `.first()` (added to tolerate stacked toasts), which could match
an EARLIER save's still-visible toast — so the test moved on (sign-out) while
the current save's change-password was still in flight. When that save
completed, its session re-establishment (better-auth rotates the session on
every change-password) re-signed the app in *after* the sign-out. Fix:
`saveAccountAndExpectSuccess` gates the toast assertion on the change-password
response (waits for it, asserts 200, then asserts the toast) — the save is
provably settled before the next step runs. Validated with 5 consecutive green
runs (was ~50% flaky).

## Risks

- **File ordering is load-bearing** for the fresh-DB bootstrap test. Mitigated:
  verified Playwright sorts file names; `admin-account` sorts first among all
  current specs. If a future spec sorts earlier, the bootstrap test would need
  reworking — note in a comment.
- **Sign-in failure message text** — the web sign-in path uses the better-auth
  client directly (`getAuthClient().signIn.phoneNumber`), bypassing the
  `translateAuthApiErrorMessage` mapping in `auth-api.ts`, so the inline error
  is the raw "Invalid phone number or password" (untranslated; observed while
  debugging). The spec asserts a regex accepting both the raw and translated
  forms. The translation gap is noted as a possible follow-up (out of scope).
- **Toast timing** — success toast has a ~4s sonner lifetime; asserted right
  after save, before any further navigation.
- **Phone change requires current password** (account service) — the profile
  edit test always provides it.
- **`revokeOtherSessions: true`** on change-password keeps the *current* session
  valid (better-auth), so no surprise sign-out mid-test; we sign out explicitly
  to test re-auth.
