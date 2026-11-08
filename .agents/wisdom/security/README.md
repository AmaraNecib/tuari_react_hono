# security lessons

Historical source: `security.md`. Read only matching topics. Current policy
lives in the engineering workflow; these retained reports do not add gates.

- [Security Wisdom](overview.md)
- [Multipart bodies are fully buffered before any size check: pre-check Content-Length (🟠 Major)](multipart-bodies-are-fully-buffered-before-any-size-check-pre-check-content-length.md)
- [Re-run `pnpm audit` at fix time: advisory lists drift (🟡 Minor)](re-run-pnpm-audit-at-fix-time-advisory-lists-drift.md)
- [better-auth dedupe: per-package resolution keeps two physical copies (🟡 Minor)](better-auth-dedupe-per-package-resolution-keeps-two-physical-copies.md)
- [Entropy gates must be calibrated to finite-sample distributions, not theoretical maxima (🟠 Major)](entropy-gates-must-be-calibrated-to-finite-sample-distributions-not-theoretical-maxima.md)
- [Verify which character a "whitespace pin" actually pins before deciding a rejection class (🟠 Major)](verify-which-character-a-whitespace-pin-actually-pins-before-deciding-a-rejection-class.md)
- [A widened input rule must not lock users out of the operation that replaces the old value (🟠 Major / Greptile P2)](a-widened-input-rule-must-not-lock-users-out-of-the-operation-that-replaces-the-old-value.md)
- [A resettable recovery file must not hold the trial anchor (🟠 Major)](a-resettable-recovery-file-must-not-hold-the-trial-anchor.md)
- [Fail-closed entitlement files need an atomic write, or the fail-closed reader locks the customer (🟠 Major / Greptile P1)](fail-closed-entitlement-files-need-an-atomic-write-or-the-fail-closed-reader-locks-the-customer.md)
- [An atomic write is only atomic if the rename lands: budget a bounded retry (🟠 Major / Greptile P1)](an-atomic-write-is-only-atomic-if-the-rename-lands-budget-a-bounded-retry.md)
