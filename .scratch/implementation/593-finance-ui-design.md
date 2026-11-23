# Employee finance tab design

Base: `f862ffad9f026d07e01c1c1a266ff673c7b31d5d`. Mode: High-assurance focused-local / CI-final-pending.

## Completed scope direction

Implementation base: `96b8dc5e724ea08da4b1b8d4c417399b681d793d`. All three owner screenshots were inspected. Use a restrained operational ledger, not a giant nested gray card. Employee-only CSS wraps the existing record frame, so the shared header interface remains unchanged. Its employee title is 28px upright Arabic sans; labels use the same sans without tracking. Existing numeric isolation remains intact.

Current totals and payment modes precede opening provenance. Opening review, correction forms, pending proposals, original audit and correction history remain visible in a separate bordered section below current activity. No disclosure hides pending operations. Forms cap at 48rem with two desktop columns and one mobile column; submit actions fit their content. Summary balances owed receive weight rather than decorative cards. All actions keep a 44px target. Existing theme variables supply light and dark colors. No handler, financial calculation, query or persistence interface changes. Architecture: no seam moved. Deletion of the CSS restores appearance without duplicating financial logic. Vocabulary retains current activity versus prior opening provenance; no domain terms change.

## Earlier direction

The finance tab will use one compact flow: salary facts, earnings history, then current payroll activity. Remove the empty duplicated finance intro, since its approval action already exists in the page header. Keep payroll actions and totals on a plain surface rather than nesting another gray container. Preserve opening provenance, review status, reminders, pending retries, confirmations, and history in place; opening values remain explicitly excluded from current work cost. Use existing RTL and theme tokens, retain terracotta actions, and avoid changing shared typography or financial behavior.
