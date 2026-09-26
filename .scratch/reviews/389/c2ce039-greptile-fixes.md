# PR #389 review fixes — Greptile 3/5 findings

- **Reviewed HEAD**: `c2ce0394d2593059aa56e05aac83ab817f8a83e9` (branch
  `feat/license-enforcement`, worktree `rev-389`)
- **Base**: local `develop` @ `7c7c833`
- **Tier**: Standard. Greptile review fixes, verified locally.
- **Lane**: `fix-license-enforcement` (workspace label; branch unchanged).

## Findings → fixes

### 1. `grace` must be READ-ONLY (`rpc-middleware.ts:111-112`)

`mutationLicenseRefusalMessage("grace")` now returns
`"انتهت صلاحية الترخيص. مساحة العمل للقراءة فقط حتى تجديد الترخيص."`; the audit
wrappers throw `UPGRADE_REQUIRED`. `trial` stays fully writable. The read-side
gate (`readLicenseRefusalMessage`, used by the edition/feature gates) still
allows `grace`.

### 2. Direct HTTP writes bypass the wrappers (`rpc-middleware.ts:86-88`)

- `POST /api/auth/profile` → gated in `AccountService.updateCurrentProfile`
  after `getCurrentSessionUser`, throws `AccountServiceError(message, 403)`.
- `POST /api/inventory/invoice-groups/:id/attachments` → gated in
  `create-app.ts` after the session + bootstrap-owner check, returns
  `403 { success:false, error:{ code:"UPGRADE_REQUIRED", message } }`.

Both use the same `mutationLicenseRefusalMessage` policy as the RPC wrappers.

### 3. Status parsing fails OPEN (`rpc-middleware.ts:111-112`)

`getLicenseInfo()` validates `TUARI_LICENSE_STATUS` against the exported
`LICENSE_STATUSES` tuple; an unrecognised or empty value becomes `"unknown"`
(absent keeps the historic `"trial"` dev/test default). The refusal helpers
explicitly return `null` only for `active`/`trial` (plus `grace` on the read
gate) and refuse everything else, with a defensive `default` so a cast value
also fails closed.

### 4. The check runs before authentication (`rpc-middleware.ts:167`)

The three redundant wrapper-level `requireUsableLicense(getLicenseInfo())`
pre-checks were removed. The audit-context creators (`requireWorkspaceAdmin` /
`requireAuthenticatedUser` first) own the gate, so error precedence is
auth → license.

## Tests added

- `infrastructure/license.test.ts`: unrecognised and empty status → `unknown`;
  `mutationLicenseRefusalMessage` (active/trial null, grace read-only, unusable
  messages) and `readLicenseRefusalMessage` (grace allowed).
- `rpc/rpc-middleware.test.ts`: grace refused with the read-only message; typo
  status refused; anonymous caller gets `UNAUTHORIZED` before the license error
  for both `mutationAudit` and `withAudit`.
- `modules/account/account.service.test.ts`: locked and grace profile updates
  refused (403, transaction never opened); anonymous caller 401 first; trial
  still writes.
- `app/create-app.test.ts`: attachment upload refused when locked and during
  grace; attachment auth error precedes the license error; profile 403 mapping.

## Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @tuari/api exec vitest run src/infrastructure/license.test.ts src/rpc/rpc-middleware.test.ts src/modules/account/account.service.test.ts src/app/create-app.test.ts` | 4 files / 127 passed, exit 0 |
| `pnpm --filter @tuari/api test` | 1289 passed, 1 skipped, 2 failed — both `recovery-key.service.test.ts` `beforeEach` hook timeouts (10s) under 100% CPU from sibling lanes; `recovery-key.service.test.ts` standalone = 24 passed, exit 0 |
| `pnpm typecheck` | 4 tasks successful, exit 0 |
| `pnpm lint` | 2 tasks successful, exit 0 |

## Flake note

An earlier full-suite run under heavier load failed 17 timeout-only tests in
`sqlite-bootstrap.port.test.ts` / `sqlite-recovery-key.port.test.ts` (files
untouched by this change); `sqlite-bootstrap.port.test.ts` passed 10/10
standalone with `--testTimeout=30000`. This is the documented loaded-machine
cold-start hook-timeout class, not a regression.
