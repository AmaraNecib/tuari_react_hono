# Issue #394 — Enforce the license seat limit (`maxUsers`)

**Mode:** remote (GitHub reachable)
**Ticket:** #394 "Commercial gap: seat limits (maxUsers) are parsed but never enforced"
**Target ref:** `develop` @ `7c7c83356c19d6dcfe0bac17a636df3ecdc88dae`
**Tier:** High-assurance (licensing)

## Problem

The license payload carries `maxUsers`, the shell forwards it as
`TUARI_LICENSE_MAX_USERS`, the API parses it (`apps/api/src/infrastructure/license.ts`),
and nothing consumes it. A one-seat license can create unlimited active
employees.

## Decided policy (from the parent brief)

- `maxUsers > 0` = hard cap on **ACTIVE** user accounts. `INACTIVE` / `LEFT`
  employees do not count.
- `maxUsers === 0` = unlimited.
- Seats are **not capped** while the license is not `active`: the post-install
  `trial` and the post-expiry `grace` window stay uncapped so a prospect can
  evaluate the product multi-user before buying. Only `status === "active"`
  enforces the cap.
- Refusal is a domain error (`CompanyError`, code `BUSINESS_RULE`) whose message
  names both the limit and the current active count. The refused mutation must
  not create/modify the employee.

## Enforcement seam

One helper, `assertActiveEmployeeSeatAvailable(repository, additionalActiveEmployees)`
in `apps/api/src/modules/company/employee-seat-limit.ts`, consumed by every
mutation that can increase the active-user count:

| Call site | File | When it fires |
| --- | --- | --- |
| `createEmployee` | `workforce.service.ts` | new employee row with status `ACTIVE` |
| `createEmployeesBatch` | `workforce.service.ts` | count of `ACTIVE` rows in the batch |
| `updateEmployee` | `workforce.service.ts` | transition from non-`ACTIVE` → `ACTIVE` (reactivation) |

`saveEmployee` delegates to `updateEmployee`, so it inherits the rule; it is not
a separate seam.

The helper counts active employees through the repository seam
(`listEmployees({ status: "ACTIVE" }).length`), reads the license through the
existing `getLicenseInfo()` env reader, and throws before the repository write
runs (inside the service transaction, so an error rolls back).

## Default-mismatch alignment

- API `getLicenseInfo()` defaulted `maxUsers` to `1` when the env var is unset
  (silent one-seat cap). It now defaults to `0` (= unlimited, the documented
  sentinel) so an unlicensed/dev run is explicitly uncapped, matching the
  trial/grace exemption.
- The Rust shell's `to_env_map()` no-license branch set `TUARI_LICENSE_MAX_USERS`
  to `"1"` while `get_license_status` reports `max_users: 0` for the same
  no-license state. The env branch is aligned to `"0"`.

No contract/wire change: `licensePayloadSchema.maxUsers` already allows 0.

## Tests

- New `employee-seat-limit.test.ts` (service seam, real in-memory sqlite harness):
  - creating the (n+1)th active employee is refused with the limit + count in
    the message and no row is created;
  - `INACTIVE`/`LEFT` employees do not consume seats;
  - reactivating a `LEFT` employee at the cap is refused and leaves the status
    unchanged; reactivating below the cap succeeds;
  - `maxUsers === 0` is unlimited;
  - unset `TUARI_LICENSE_MAX_USERS` on an `active` license is unlimited;
  - `trial` and `grace` are uncapped;
  - a batch whose active rows would exceed the cap is refused atomically.
- Updated `license.test.ts` default assertions (`1` → `0`).
- Updated `license.rs` `to_env_map` no-license assertion (`1` → `0`).

## Risks / out of scope

- The seat rule is API-only; the shell does not enforce it (the issue's task
  scopes enforcement to the API).
- `feat/license-enforcement` (issue #389) owns the license **status** gate and
  also edits `infrastructure/license.ts`. This lane does not touch status
  logic; the only shared line is the `maxUsers` default literal (different
  hunk). After #389 merges, audited mutations in `grace` are refused by that
  gate, which is stricter than (and independent of) this seat rule.
- Custom roles are stubbed (`createRole` throws), so "active user accounts"
  means employee rows only; the auth/owner account is not an employee row and
  is not counted.
