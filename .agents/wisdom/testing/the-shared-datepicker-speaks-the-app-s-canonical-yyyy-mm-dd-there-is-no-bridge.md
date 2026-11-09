## The shared DatePicker speaks the app's canonical `yyyy-MM-dd` — there is no bridge (🟠 Major)

`apps/web/src/components/ui/date-picker.tsx` takes canonical `yyyy-MM-dd` in and
out; `dd/MM/yyyy` is display-only inside the component. This is the second
iteration of the contract: the first version spoke `dd/MM/yyyy` and every screen
had to bridge to canonical state, which was forgotten on most screens (dates
silently nulled, and in one case `new Date("dd/MM/yyyy")` parsed month-first and
stored a wrong day). #428 inverted the contract and deleted the
`toDatePickerValue`/`fromDatePickerValue` helpers.

**If you find `toDatePickerValue` or `fromDatePickerValue` anywhere, it is dead
code from before the inversion** — pass canonical state straight to the
component. A rebase that merges an older branch over the inversion will
reintroduce those calls and every screen rendering that dialog throws
`toDatePickerValue is not a function`; the fix is to delete the calls, not to
restore the helpers.

