# Design — issue #226: Auth bootstrap input hardening at the service boundary

**Tier:** High-assurance (first-user bootstrap is an auth/security concern —
includes debate step)
**Base:** `develop` @ `f93c37c0dd91646bfdc106c0e0bcc05b149b9e0c` (merge-base == HEAD)
**Branch:** `refactor/issue-226-bootstrap-input-hardening`

## Problem

`AuthBootstrapService.bootstrapFirstUser` relies entirely on the RPC wire gate
(ORPC validates `authBootstrapInputSchema` before the handler runs). At the
service boundary itself nothing validates, so a future caller or a mis-wired
port could:

- create a first user with a blank/whitespace phone — such a user never counts
  as "configured" (`hasConfiguredUsers` filters `TRIM(phone) != ''`), enabling
  a second bootstrap and leaving the bootstrap-state row pointing at the broken
  user,
- hash and store an empty / 1-char password (better-auth `hash()` applies no
  policy),
- store an untrimmed or over-long name.

Reachable today? No — the RPC route validates first. This is defense-in-depth
at the auth boundary.

## Approach

**Reuse `authBootstrapInputSchema` from `@tuari/contracts` as the service's
own validation gate.** The schema is already the single source of truth for
"what is a valid bootstrap input" — the wire gate and the service gate share
one definition and can never drift. Precedent: `AccountService`
`updateCurrentProfile` reuses `algerianPhoneSchema.safeParse` at its boundary.

`bootstrapFirstUser` becomes:

1. `authBootstrapInputSchema.safeParse(input)` — on failure return a
   `{ success: false, error: { code: "VALIDATION", ... } }` result built from
   the Zod issues, **before hashing or touching the port**.
2. Setup-key check (unchanged logic; operates on the parsed/normalized data).
3. Password hashing via the auth instance (unchanged).
4. `port.createFirstUser(...)` with the **parsed** (normalized) values —
   `parsed.data.name` / `parsed.data.phone` are already trimmed by the schema,
   completing the service's normalization duty (it already trimmed name
   explicitly; phone now gets the same treatment).

### Why the schema (not hand-rolled checks)

- Covers all three acceptance criteria in one expression: blank/whitespace
  phone (regex fails), empty/short password (`min(8)`), empty name
  (`trim().min(1)`), plus over-long variants (`max(120)` / `max(128)`) and
  malformed phones — for free.
- No drift risk between the wire contract and the service contract; a future
  caller gets exactly the same validity definition as the wire.
- Matches the existing `AccountService` boundary pattern.

### Behavior-change audit (valid inputs)

- Via RPC, ORPC already delivers parsed (trimmed) input, so
  `parsed.data === input` in practice — no observable change for wire callers.
- Direct callers with whitespace-padded but *valid* phone now get a normalized
  (trimmed) phone persisted instead of a padded one — a correctness
  improvement, and `hasConfiguredUsers` treats both as configured, so no
  bootstrap-reenabling hazard is introduced.
- Existing unit tests pass `BOOTSTRAP_INPUT` with no padding → green.
- Edge: `setupSecret: ""` now yields `VALIDATION` (empty secret is malformed
  input) instead of `UNAUTHORIZED` — both reject before the port; via the wire
  the empty secret is already rejected at BAD_REQUEST. No security regression.

### Ordering

Validation runs **before** the setup-key check, mirroring the existing layering
(wire validation → handler → setup-key check): the input gate is outermost,
fail fast on garbage. Invalid-input + wrong-key callers get `VALIDATION` instead
of `UNAUTHORIZED` — no information leak (validation errors reveal nothing about
key correctness).

## Public API

`BootstrapResult` failure union widens:

```ts
code: "CONFLICT" | "UNAUTHORIZED" | "VALIDATION";
```

The wire output schema (`createEntityResultSchema(sessionUserSchema)` →
`appErrorSchema` → `appErrorCodeSchema`) already includes `"VALIDATION"`, so no
contract change is needed and the RPC serialization accepts the new code.

Field-error messages are Arabic, consistent with the service's existing
hardcoded copy (`BOOTSTRAP_CONFLICT_MESSAGE` / `BOOTSTRAP_SECRET_MESSAGE`) and
the web i18n strings (`auth.validation.*`):

| field | too_small | other (invalid_string / too_big / ...) |
|---|---|---|
| name | "الاسم مطلوب." | "الاسم يجب ألا يتجاوز 120 حرفًا." |
| phone | — | "رقم الهاتف يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام." |
| password | "كلمة المرور يجب أن تكون 8 أحرف على الأقل." | "كلمة المرور يجب ألا تتجاوز 128 حرفًا." |
| setupSecret | "رمز الإعداد الأول مطلوب." | "رمز الإعداد الأول غير صالح." |

(phone has no `.min()` in the schema, so it only ever produces a
non-too_small issue.) Unknown fields fall back to a generic message.

## Files touched

- `apps/api/src/modules/auth/bootstrap.service.ts` — validation gate +
  message mapping; consume `parsed.data` for the port call.
- `apps/api/src/modules/auth/bootstrap.service.test.ts` — rejection-path unit
  tests (service level).
- `apps/api/src/rpc/router.test.ts` — one black-box test pinning that invalid
  `authBootstrap` input is rejected at the wire gate (BAD_REQUEST), documenting
  the defense layering ("reachable today? No").

No contract, adapter, dependency, or web changes.

## Planned tests

### Unit — `bootstrap.service.test.ts` (new rejection cases)

Each asserts the `VALIDATION` failure result shape **and** that neither
`hash` nor `port.createFirstUser` ran:

1. blank phone (`""`) → VALIDATION, fieldErrors `[{ field: "phone", ... }]`.
2. whitespace-only phone (`"   "`) → VALIDATION.
3. malformed phone (`"1234567890"`) → VALIDATION.
4. empty password (`""`) → VALIDATION.
5. short password (`"1234567"` — 7 chars) → VALIDATION.
6. empty name (`""`) → VALIDATION.
7. whitespace-only name (`"   "`) → VALIDATION.
8. over-long name (>120 chars) → VALIDATION.
9. valid input still reaches the port (existing tests — unchanged, stay green).

### Router — `router.test.ts`

- invalid `authBootstrap` input (blank phone/name/password) rejects at the wire
  with `{ code: "BAD_REQUEST" }` and the service mock is never invoked.

### E2E (Playwright)

**Not applicable / already covered** — no user-facing behavior change. The
first-user bootstrap flow is exercised end-to-end by
`tests/e2e/foundation-smoke.spec.ts`. The rejection path is defense-in-depth,
unreachable through the UI (client pre-validates with the same schema and the
wire gate rejects first). Same rationale as #196/#202/#204.

## Implementation risks

- **Message-precision gold-plating.** The rejection path is unreachable via
  current wiring; a per-issue-code Arabic map is enough (not per-value
  messages). Mitigated by keeping the map small and truthful.
- **Setup-key edge (`setupSecret: ""`)** changes error code from UNAUTHORIZED
  to VALIDATION for direct callers. Both reject before the port; documented
  above; no test asserts the old behavior for the empty-string case.
- **`parsed.data` replaces `input` for the port call.** Normalization only
  (trim); wire callers already receive trimmed values, so observable behavior
  is unchanged.
