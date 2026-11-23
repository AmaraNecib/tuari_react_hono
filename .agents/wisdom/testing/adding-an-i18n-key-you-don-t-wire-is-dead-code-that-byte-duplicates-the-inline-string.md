## Adding an i18n key you don't wire is dead code that byte-duplicates the inline string (🟠 Major)

On #34, the invoice-details error surface mirrored the DebtsLoadError pattern
and added `detailPages.invoice.loading` — but the loader stayed the page's
inline Arabic literal, so the new key was never referenced: dead translation
key + two copies of the same Arabic string (ar.ts + JSX + test) that can
drift. The review caught it; the key was dropped. The error path's
`loadError` key IS wired via `t("detailPages.invoice.loadError")` and the
i18n-keys scanner stays green.

**Always**: when adding i18n keys alongside a page whose strings are still
inline (unconverted pages), every key you add must be referenced by the
component in the same change — a `loading`/`loadError` key added to "fix a
hardcoded string" without wiring it is exactly what the i18n scanner flags
later. Either wire it or don't add it.

