## A resettable recovery file must not hold the trial anchor (🟠 Major)

On #396, `clock-tracker.json` stored both the clock high-water mark and
`install_wall`, and the post-install trial was derived from `install_wall`. The
documented recovery for a false clock-tamper warning is deleting that file.
Because a missing file was recreated with `install_wall = now`, the recovery
also restarted the 30-day trial, forever. Split the two: the resettable tracker
keeps the high-water mark, and a second file (`install-anchor.json`) holds the
install time. The install time is the earliest of the two, and the anchor is
only ever moved earlier, so neither a fresh tracker nor a hand-edited one can
inflate the window. A pre-anchor install seeds the anchor from its existing
tracker instead of `now`, so upgrading does not hand it a fresh trial.

**Always**: when a file is documented as safe to delete for recovery, it must
carry only the state that recovery is meant to clear. Any derived entitlement
(trial window, quota anchor, cache of a license decision) needs a durable home
the recovery does not touch, and the reader must take the earliest credible
evidence rather than trusting whichever file happens to exist.

