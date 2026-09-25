# Issue 21 — i18n: untranslated English "inline" in Arabic counterparty create copy

## Context
The counterparty create page (external-create-page.tsx) renders
`externals.create.description`, which in the Arabic resource
(`apps/web/src/i18n/resources/ar.ts`) mixed an untranslated English word
"inline" into otherwise Arabic copy, breaking the RTL reading flow.

## Change
Copy-only. Replaced the English "inline" inside the Arabic sentence with the
natural Arabic equivalent "مباشر" (direct), preserving the meaning: there is
no inline creation in this version; create the counterparty first, then record
entries from its own page.

Resulting copy:
> أنشئ الطرف الخارجي أولًا ثم سجّل القيود من صفحته الخاصة. لا يوجد إنشاء مباشر في هذا الإصدار.

## Locale scope
The web app is Arabic-only today: `apps/web/src/i18n/index.ts` sets
`lng/fallbackLng/supportedLngs` to `["ar"]`, and `resources/` contains only
`ar.ts`. There is no English (or other) locale file to update, so this is a
single-file string change.

## Tests / checks
The i18n key gate (`pnpm check:i18n-keys`) scans `t()` call keys against
`resources/ar.ts` keys; this change does not add, remove, or rename a key, so
no key drift is expected. No key or shape changed.

## Risks
- None for the key gate. Pure copy change, no structural or type impact.

## Fixed base SHA
7097719c8b5e6526bf1386484e8750b1d5443d71

## Review tier
Lightweight (copy-only change).
