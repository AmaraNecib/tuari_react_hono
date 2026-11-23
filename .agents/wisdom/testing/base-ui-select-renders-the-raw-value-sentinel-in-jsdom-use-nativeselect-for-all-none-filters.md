## Base UI Select renders the raw value/sentinel in jsdom; use NativeSelect for "all/none" filters (🟡 Minor)

On #411 the filter selects used Base UI `Select` with a `__none__` sentinel for
"all projects"; in jsdom the trigger rendered the literal `__none__` instead of
the selected item's label, and the option list only exists while the popup is
open. The repo's `NativeSelect` (a plain `<select>`) renders real labels and
options, is trivially testable, and is what `system-log-section.tsx` already
uses for its `"ALL"` sentinel.

**Always**: for optional "all/none" filter dropdowns in this app, use
`NativeSelect`; reserve Base UI `Select` for value sets that need its popup.

