## i18n drift: `t(key, {options})` is NOT a fallback. Classify before scanning (🟠 Major)

On #271, the first version of `scripts/check-i18n-keys.mjs` classified any 2-arg
`t()` call as "has fallback", so `t("key", { count })` (i18next options object,
interpolation vars, NO text default) was counted as safe. But i18next returns
the raw key when the key is missing and the 2nd arg is an options object without
`defaultValue`. Those sites rendered raw keys (e.g. `appShell.rolesPermissionCount`,
`common.fieldRequired`). Fix: a text fallback is ONLY a string/template literal
2nd arg (`ts.isStringLiteral` / `ts.isTemplateLiteral`); an object 2nd arg is
options → still a hard missing. The corrected count was 69 (matching the issue).

**Always**: in i18n key scanners, treat `t(key, {…})` as missing-without-fallback.
Also: template-literal fallbacks with `${}` interpolation are text fallbacks
(safe), so classify `isTemplateLiteral` (any) as having a fallback.

