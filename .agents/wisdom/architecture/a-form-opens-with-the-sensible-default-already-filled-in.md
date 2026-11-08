## A form opens with the sensible default already filled in (🟠 Major)

The owner's rule, stated flatly: *"there should always be default values. For
example the date is today... Also for example, the default salary is the full
salary — so these things should have the default values directly."*

Applied correctly, this removes typing, not control:

- **A form that creates or records something** defaults every field the app
  already knows: the date to today, the amount to the full/expected figure the
  app can compute, the relation when there is exactly one candidate.
- **A filter stays empty.** Empty means "no filter"; defaulting a filter to today
  silently hides data, which is the opposite of the rule.
- **A default is a starting point, never a constraint.** It stays editable, and
  it must not overwrite what the operator typed — the `#420` behaviour is the
  reference: an untouched amount follows a days change, a typed one wins.
- **A default must never be guessed.** If a field plausibly has an obvious value
  but the rule is not certain, ask the owner; do not invent a business rule.

The audit that produced this entry is worth reading as a cautionary tale about the
measurement, not just the rule. A grep for the helper name found **one** file
defaulting a date to today and sixteen that did not — but the app's canonical
today helper is `getAlgeriaDateInputValue` (39 call sites), and the single file
found was the one that had **reinvented it privately** as `getTodayDateValue`.
So the sixteen "missing" defaults were mostly fine, and the real defect was the
one screen that bypassed the shared helper — it built a UTC day
(`new Date().toISOString().slice(0, 10)`), so between 23:00 and 24:00 UTC the
invoice date was a day behind the Algeria business day (issue #440).

Two lessons worth keeping: **measure against the canonical helper, not the name
you expected** — a private copy is invisible to a name-based search and is the
thing you are actually looking for; and **put a shared default in a shared module
the first time**, because a private helper is exactly how one screen drifts from
the other sixteen while looking correct in isolation.

Sibling rule, same family: when a save is blocked, **say why, on screen, naming
what is missing** — a disabled button with no reason is a silent failure. See the
invoice save-reason pattern: `validateLines` returns the first localized reason
and `saveDisabledReason` renders it in a `role="status"` line beside the
disabled save control
(`apps/web/src/features/inventory/inventory-invoice-create-page.tsx`).
