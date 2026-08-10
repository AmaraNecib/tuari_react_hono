# Code Review — issue #271 (i18n raw keys + ar.ts drift + CI gate)

- Head SHA: `37304f8`
- Base: `origin/develop` (merge-base `03ec349`)
- Diff: 48 files, +1676 / -425
- Two-axis review (Standards + Spec), run as parallel `reviewer` sub-agents
  (workflow `69b06d70`)

## Standards axis

**No blockers.**

Verified correct (with evidence):
- ar.ts semantic integrity preserved: `changed: 0` across all 867 pre-existing
  keys; all 61 removed keys accounted for (12 shadowed `auth.auditLog.*`,
  44 dead `debt.*` block, 5 `sections.debts.*` → canonical `debts.*`), with
  call sites renamed and 0 stragglers (grep + checker).
- Tokenizer contract verified against server output
  (`apps/api/src/modules/company/company.system-log.ts` emits `مكتمل`,
  `نوع الحركة`, `القيمة`, `الرصيد بعد العملية`, `المبلغ المدفوع` — ar.ts
  `systemLog.*` values match).
- Checker soundness: 1420 calls, 0 missing, 7 dynamic keys (all genuine map
  lookups returning valid keys: `statusLabelKeys[status]`, `i18nKey`, …); no
  `{ defaultValue }` options-object usage exists so that blind spot causes no
  current false positives; redundant-fallback detection correct on 3-arg calls.
- Gate wired into root `lint` + `test`; `node --test tests/i18n-keys.test.mjs`
  passes 2/2; no staged files at review time.

Advisory notes (judgement calls, no action required):
1. `system-log-section.tsx:136-137` — `text-[12px]→text-[0.75rem]`,
   `1px→0.0625rem` cosmetic Tailwind churn. **Intentional**: repo convention
   is rem not px (user directive); 12px = 0.75rem, 1px = 0.0625rem.
2. 6 redundant fallbacks remain in `license-settings.tsx` — all are 3-arg
   i18next v21 calls `t(key, fallback, { options })`; the stripper handles
   2-arg string form only. Kept deliberately as safety nets (resource wins
   when the key exists).
3. Design doc contradicted the implemented `debts.*` canonical direction —
   **fixed** (see design doc update in this commit).

## Spec axis

**No blockers** — all issue #271 requirements verified:
1. All raw-key call sites fixed: `node scripts/check-i18n-keys.mjs` reports
   `missing: 0` across 1420 t() calls (was 69 before).
2. Namespace collapse done: `appShell.*→shell.*`,
   `workspace.notFound.*→detailPages.notFound.*`, `sections.debts.*→debts.*`,
   `auth.login.*→flat auth.*`, `inventory.transfer.create/creating` added.
3. Shadowed `auth.auditLog` removed; keys moved to top-level `auditLog` —
   audit-log-page.tsx resolves (checked).
4. CI gate wired into root `lint` AND `test`; drift-probe verified the gate
   fails when a missing key is introduced.
5. `systemLog.*` tokenizer values match server-emitted Arabic.

Scope notes: `generate-i18n-ar.mjs` / `strip-redundant-i18n-fallbacks.mjs` are
one-off migration tools, not CI-wired (only `check-i18n-keys.mjs` is the gate).

## Summary

- Standards: 0 blockers, 3 advisory notes (all dismissed/fixed).
- Spec: 0 blockers — every requirement verified in code.
