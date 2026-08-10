# Issue #271 — i18n: raw key rendering + ar.ts resource drift + CI key check

## Problem (from issue, re-verified)

User-facing UI renders raw i18n key strings because `t()` references keys missing
from `apps/web/src/i18n/resources/ar.ts` (single `translation` namespace, `lng: "ar"`,
`fallbackLng: "ar"` — i18next returns the key when missing, no `defaultValue` used).

- ~69 call sites render raw keys in reachable routes (system-log columns, record-payment
  dialog, 404 page, first-run tour, debts, inventory, roles…)
- ~555 keys used by `t()` are missing from `ar.ts`
- Namespace drift: `appShell.*` vs `shell.*`, `debts.*` vs `sections.debts.*`,
  `inventory.transfer.create/creating` vs `transfer.button`, `workspace.notFound.*` vs
  `detailPages.notFound.*`
- Shadowed `auth.auditLog` block (dead code under `auth`)
- 396 call sites carry inline Arabic fallback literals (second arg)

## Root cause of the tokenizer break

`system-log-section.tsx` `parseDetailTokens`/`getDetailTokenClassName` match server
detail lines with `i18n.t("systemLog.completed|completedFeminine|entryType|value|balance|status|paidAmount")`.
Those keys are missing from `ar.ts`, so `i18n.t()` returns the literal key string and
the tokenizer never matches the server's Arabic text (`نوع الحركة …`, `القيمة …`,
`الرصيد بعد العملية …`, `المبلغ المدفوع … دج`). Fixing the resource keys with values
that equal the server's emitted Arabic restores structured chips.

## Design

### 1. Drift detection tool (CI gate)

`scripts/check-i18n-keys.mjs` (plain Node, `typescript` for parsing ar.ts, no new deps):

- Parse `ar.ts` → nested object (TS AST, `ts.createSourceFile` + evaluation of the object
  literal via a small transformer or `typescript.transpileModule` → `Function` eval; values
  are plain double-quoted strings with `{{var}}` interpolation).
- Scan `apps/web/src` (exclude `i18n/`): collect every `t("literal.key")`,
  `i18n.t("literal.key")`, `t('literal.key')`; also template-literal `t(\`…\`)` with
  constant content.
- For each call, note whether a 2nd-arg fallback exists.
- **Fail** (exit 1) on literal keys missing from the resource **without** a fallback arg
  (these render raw keys — the bug).
- **Warn** (report only) on keys with fallbacks (drift smell, gradual cleanup) and on
  dynamic/template keys that can't be resolved (manual review list).

Wiring (mirrors `check:web-hygiene`):
- `tests/i18n-keys.test.mjs` (node:test) runs the checker, asserts zero missing keys.
- Root `package.json`: `"check:i18n-keys": "node --test ./tests/i18n-keys.test.mjs"`,
  appended to `lint` and `test` chains → runs in CI lint job (root turbo task) automatically.

### 2. Resource fix (ar.ts = truth)

- Add all missing keys to `ar.ts` under the **canonical** namespace (resources = truth):
  - promote inline Arabic fallbacks where present (call site becomes `t("key")`),
  - write fresh Arabic for keys without fallbacks,
  - `systemLog.*` values must equal the server's emitted Arabic so the tokenizer matches.
- Collapse duplicates: delete shadowed `auth.auditLog` block; remove duplicate
  `detailPages.debt.*` vs `debt.*` (keep `debt.*` used by record-payment dialog, alias
  `detailPages.debt.*` where referenced).
- Canonical rename map (call-site edits):
  - `appShell.*` → `shell.*`
  - `workspace.notFound.*` → `detailPages.notFound.*`
  - `debts.*` (code) → `sections.debts.*` (resource) — except `debts.cases.*` which stays
    under a `debts.cases` canonical block
  - `auth.login.*` → `auth.*` flat keys
  - `inventory.transfer.create/creating` → `inventory.transfer.button`

### 3. Tokenizer fix

After resource keys exist, verify `system-log-section.tsx` tokenizer matches server lines;
keep the translated-label matching (works once keys resolve). No structural change unless
a prefix never matches server output (checked in implementation).

### 4. Tests

- Unit: `check-i18n-keys` self-test (missing key → fail; fallback → warn-only; nested key
  resolution).
- Unit: tokenizer/detail rendering against server-shaped Arabic lines
  (parseDetailTokens is module-private — test via rendered component or extract helper).
- Playwright E2E (`tests/e2e/`): system-log page renders Arabic labels, NOT raw keys;
  record-payment dialog renders translated title/labels.

## Dependencies

- Existing: `typescript` (root + web), `node:test` pattern, `i18next` web.
- No new packages.

## Risks

- ~160 keys without inline fallbacks need hand-written Arabic → delegate per-namespace to
  parallel sub-agents, single writer for `ar.ts`.
- Server-emitted Arabic in `company.system-log.ts` is the contract for `systemLog.*`
  tokenizer keys — document with a comment in ar.ts.
- Large single-file diff in ar.ts; keep commits per namespace group.
- CI gate must be lenient about dynamic keys (allowlist) to avoid false positives.

## Verification

- `node scripts/check-i18n-keys.mjs` → 0 missing keys.
- `pnpm check:i18n-keys`, `pnpm typecheck`, `pnpm lint`, `pnpm test:web`, `pnpm test:api`.
- E2E: system log + record-payment flows show Arabic, no `xxx.yyy` raw keys.
