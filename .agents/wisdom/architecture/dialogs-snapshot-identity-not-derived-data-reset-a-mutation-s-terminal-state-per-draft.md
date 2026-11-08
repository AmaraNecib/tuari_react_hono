## Dialogs snapshot identity, not derived data; reset a mutation's terminal state per draft (🟠 Major)

Two related round-4 #412 findings. (1) `SalariesSection` copied the worker's
wage, period, and assignment windows into state when the dialog opened, so a
workspace refresh after a wage change left the open dialog proposing the old
amount while the server would compute from the new wage. (2) The employee quick
form's create-payment mutation kept `isSuccess` after a successful save, so
reopening the form and then receiving a workspace refresh re-ran the success
effect, wiping the new draft and collapsing the form.

**Always**: a dialog opened from a list stores only the target's identity in
state; read the wage, period, windows, and everything else from the live query
data on each render (the dialog's own prop-change reset handles re-derivation).
And a mutation's terminal flag (`isSuccess`/`isError`) is per-mutation-instance,
not per-draft — call `reset()` when a new draft is opened (or guard the success
effect with a ref), otherwise a later refresh replays an old success. Test both
by mutating the mocked mutation state and re-rendering, and confirm the
assertion fails on the pre-fix component.

