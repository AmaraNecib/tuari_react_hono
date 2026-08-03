# Issue #227 — Playwright E2E: recovery-key settings flow (generate / revoke / consume)

## Context

Issue #195 extracted `RecoveryKeyPort` (merged). The recovery-key settings UI component
(`apps/web/src/features/app-shell/security-section.tsx`) exists but is **orphaned** —
it is not wired into the Settings page, and no Playwright coverage exists
(the only E2E today is `apps/api/src/modules/auth/recovery-key.e2e.test.ts`, a vitest
service-level test). CI also has **no `test-e2e` job** yet.

## Gap analysis (verified in code)

- `SecuritySection` (presentational, props-driven) is imported nowhere.
- Settings page (`settings-section.tsx`) has tabs: account / appearance / licensing /
  system / about — no security tab.
- API is complete: `getRecoveryKeyPool`, `generateRecoveryKeys`, `revokeRecoveryKey`,
  `consumeRecoveryKey`, `changeDbEncryptionKey` (rpc/handlers/system.ts) wired to
  `RecoveryKeyService`.
- Web RPC client (`rpcClient`) exposes all of them via `@tuari/contracts` `systemContract`.
- i18n keys `settingsSecurity*` already exist in `ar.ts` (titles, statuses, buttons,
  counts). Missing: keys for the "generated keys shown once" dialog.
- The generate flow today never surfaces the plain-text keys (they only exist in the RPC
  response) — contradicts the documented copy "تُعرض مرة واحدة عند الإنشاء ثم تُخفى"
  (shown once at creation then hidden).

## Scope

1. **Wire the settings UI** so the flow is reachable:
   - New `recovery-key-hooks.ts`: `useRecoveryKeyPoolQuery`, `useGenerateRecoveryKeysMutation`,
     `useRevokeRecoveryKeyMutation` (tanstack-query over
     `rpcClient`; invalidate `["recovery-key","pool"]` on mutations). No consume hook — there
     is no web UI that consumes keys (that happens at password-reset time in the desktop
     app), so the E2E drives `consumeRecoveryKey` via the RPC directly.
   - New `recovery-key-settings.tsx` (connected): renders `SecuritySection` with hook data +
     a "keys shown once" dialog after generation (matches documented product behavior and
     gives the E2E a user-visible surface to capture a plain key).
   - `settings-section.tsx`: add `security` tab → renders `<RecoveryKeySettings />`.
   - i18n: add `settingsSecurityGeneratedKeys*` keys to `ar.ts`.
2. **Playwright spec** `tests/e2e/recovery-keys.spec.ts` (serial):
   - bootstrap auth (existing `tests/e2e/helpers/session.ts`).
   - Navigate: settings → security tab.
   - Empty state: متاح 0 / الحد الأقصى 5, no masked rows.
   - Generate → "keys shown once" dialog with 3 keys (pattern `xxxxxx-xxxxxx-xxxxxx`)
     → capture one key → confirm → masked list shows 3 rows (`xxxx-****-****`), متاح 3.
   - Revoke one → متاح 2, one row shows ملغى (REVOKED).
   - Consume one (no web UI exists; consume is exercised at password-reset time in the
     desktop app) → call `POST {api}/rpc/consumeRecoveryKey` from the browser context with
     the captured key (credentials: include — same cookies the app uses) → refresh the pool
     → متاح 1, one row shows مستخدم (CONSUMED).
   - Assert plain-text keys never appear in the masked list.
3. **CI**: add `test-e2e` job to `.github/workflows/ci.yml` (ubuntu-latest, install
   chromium via `pnpm exec playwright install --with-deps chromium`, run `pnpm test:e2e`).
   Acceptance says "Runs green in CI test-e2e".

## Wire protocol notes (for the consume step)

`@orpc/client` `RPCLink` sends: `POST {apiBaseUrl}/rpc/{procedureName}`, header
`Content-Type: application/json`, body = the ORPC standard envelope
`{ "json": <input> }` (input is `null` for no-input procedures), cookies via
`credentials: "include"`. The response body is the same envelope — the
procedure output lives under `"json"` (e.g. `{ "json": { "success": true } }`).
Verified against `@orpc/standard-server-fetch` `toFetchBody`/`toFetchRequest`
and empirically against the running API.

## Tests planned

- Unit: none needed for the hooks beyond what exists — hooks are thin tanstack-query
  wrappers over an already-typed RPC client. (Vitest suite must stay green: `pnpm test:web`.)
- Playwright: `tests/e2e/recovery-keys.spec.ts` (above).

## Deferred (out of scope, pre-existing)

- `employees.spec.ts` is skipped: `employeesBatchCreate` only accepts the legacy
  roles (worker/project_manager/warehouse_manager), which the RBAC consolidation
  (Slice 3) removed — every role the UI offers is rejected. Needs a workforce-domain
  fix before that spec can run.
- The other e2e specs were already broken on develop (login helper, stale selectors);
  stale selectors were fixed here so the new `test-e2e` CI job can run green.

## Risks

- `SecuritySection`'s DB-key-change form (`onChangeDbKey`) is desktop-only in intent; in
  web the handler runs a no-op PRAGMA on the unencrypted dev DB. We wire it to the RPC
  (`changeDbEncryptionKey`) but the E2E never interacts with it.
- ORPC response envelope assumptions → validated empirically by running the spec
  (capture real generate response to confirm `keys` shape).
- CI e2e adds runtime; chromium install + two dev servers (api+web) in one job.
