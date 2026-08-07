# 249 — Coverage 100%: payments + account modules (high-assurance)

## Context

Issue #249 (Part of #248 — Coverage enforcement + failure-mode testing policy):
add `src/modules/payment/**` + `src/modules/account/**` to the API vitest coverage
`include` with **100%** thresholds on all four metrics (statements, branches,
functions, lines), and add tests so the thresholds are honest.

Both modules are small and financially-adjacent (payments allocate money against
invoices; account manages profile/phone/password changes). Grouped per the issue.

## Tier

**High-assurance** — financially-adjacent modules. Full pipeline:
Guard P1 → quality check → Debate → Test audit → Code-review → Guard P2 → Push.

## Base commit

- Target branch: `develop`
- Merge-base: `bb49ec29335adb1564ba69bc7f1d91a2e9f43b33` (= current HEAD, branch is clean)
- Branch: `refactor/issue-249-coverage-payments-account`

## Baseline coverage (measured, config-exclude applied)

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered |
|---|---|---|---|---|---|
| `account/account.repository.ts` | 4.54 | 0 | 12.5 | 4.54 | 44–138, 155–157 |
| `account/account.service.ts` | 71.11 | 62.22 | 100 | 71.11 | 90, 94, 100, 115–134 |
| `payment/payment.module.ts` | 80.85 | 60.71 | 77.77 | 80.43 | 150–176, 187 |

Notes:
- `**/*.types.ts` excluded → `payment.types.ts` (error classes) not counted.
- `**/adapters/**/*.ts` excluded → both payment adapters not counted.
- `payment.repository.ts` / `payment-module.interface.ts` are type-only → no runtime statements, not counted.
- `account.repository.ts` is a Drizzle adapter NOT under `adapters/` → counted; must be tested against a real SQLite connection.

## Changes

### 1. `apps/api/vitest.config.ts`

Add to `coverage.include`:
```ts
"src/modules/account/**/*.ts",
"src/modules/payment/**/*.ts",
```

### 2. `apps/api/src/modules/payment/payment.module.test.ts` (extend)

`listPaged` cursor decoding in `payment.module.ts` (IIFE at 149–176) is the only
untested module logic besides the `delete` not-found throw (187). Add:

- **valid cursor** (base64url of `{ sortValue: number, id }`) → decodes and pages
- **string sortValue cursor** → decodes
- **null sortValue cursor** → decodes
- **`sortValue: true` (bad type)** → `after` = undefined, no throw
- **JSON `null`** → undefined
- **JSON string** (non-object) → undefined
- **JSON array** (`id` missing) → undefined
- **JSON with numeric `id`** → undefined
- **garbage base64** → catch → undefined
- **no cursor** → already covered by existing behavior, assert paging + totalCount
- **delete non-existent payment** → `PaymentNotFoundError`

### 3. `apps/api/src/modules/account/account.service.test.ts` (extend)

Branch gaps in `updateCurrentProfile`:
- `{}` empty input → 400 "أدخل اسمًا أو رقم هاتف واحدًا على الأقل."
- name 121 chars → 400 "يجب أن يكون الاسم بين حرف واحد و120 حرفًا."
- invalid phone (e.g. `0812345678`) → 400 "أدخل رقم هاتف جزائري صالح."
- phone change with valid current password + credential hash + verify=true + no existing user → success (covers L115–135 false branches)
- no credential password on record → 400 "تعذر التحقق من كلمة المرور الحالية."
- wrong current password (verify=false) → 401 "كلمة المرور الحالية غير صحيحة."
- phone already used by another user → 409 "رقم الهاتف مستخدم بالفعل."
- phone === session phone (same phone) with no password → success (L110 false branch)
- `getCurrentSessionUser`: user without id → 401; user without phoneNumber → 401; user with `name: null` → returns null name

### 4. NEW `apps/api/src/modules/account/account.repository.test.ts`

Drizzle integration test against `:memory:` SQLite (pattern: `sqlite-bootstrap.port.test.ts`):

- `createProfileHistory`: row persisted with `passwordChanged: 1` and with omitted → 0; ISO strings written
- `findCredentialPasswordByUserId`: credential account → hash; non-credential account → null; no account → null
- `findUserIdByPhoneNumber`: found → id; not found → null
- `updateUserProfile`: name-only, phone-only (sets `phoneNumber` + `phoneNumberVerified=1`), both; missing user → throws "User not found: …"
- `withTransaction`: callback commits (reads see the write)

## Planned tests

- Unit: extended `payment.module.test.ts`, extended `account.service.test.ts`, new `account.repository.test.ts`
- Playwright E2E: none — this issue adds no user-facing behavior; the modules are exercised via existing API integration paths. (Documented as non-applicable; coverage is unit-level.)

## Risks

- v8 branch counting on the payment cursor guard chain requires several cursor shapes — enumerated above.
- Drizzle repo test needs the full app schema (`schemaStatements`) + foreign keys ON.
- TS4058 / dts build: no public API surface changes; types unchanged.
- `pnpm test:api` must stay green; thresholds now apply repo-wide at 100% for the added dirs.

## Verification

- `pnpm typecheck && pnpm test:api && pnpm lint`
- `pnpm exec vitest run --coverage` from `apps/api` → 100/100/100/100
