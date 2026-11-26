# Issue 393 checkout-source attribution correction

Base: baaca20ef708cdf5dfa31538e609f153254a3fba, freshly fetched origin/develop.
Canonical tree: D:/worktrees/tuari_react_hono/t3-701bceb4-ba8be0b88a09a369.
Mode: focused-local / CI-final-enforced, with current protection verified
separately before publication/merge. Tier: high-assurance release evidence.
Architecture: no seam moved.

The merged manual runbook calls event/release target17911dc14211730bec6982707f518b4c84dafa19
"that same source" for Nightly533. That wording can misidentify the built source.
The already-preserved official run45572361803 checkout log explicitly selects
develop and prints9401180a21ef990fe7f9d5c8e0a43d39db440747 at07:59:06Z.

Correct only that paragraph to distinguish event/release metadata, actual logged
checkout and the separately observed mutable tag. Keep the exact-byte provenance
and runtime caveats. The source of truth remains the linked official run, not an
ignored local report. No attestation query, artifact download, build, test run,
installer execution, release decision, activation or issue closure is part of
this correction. Existing reports are not rewritten to imply new execution.

Focused proof checks the replacement against the preserved log and run metadata,
relative links, diff whitespace and unslop. Save exact-SHA results in ignored
.scratch/reviews/393/checkout-source-correction/. Source and docs are committed
before independent bounded review. Carry forward the prior three lenses for
unchanged runbook content, with a fresh combined-delta check of this factual
correction. Publication still requires current-head hosted verdict, CI acceptance
and effective protection. The PR is Part of #393, never Closes #393.

Read task-scoped desktop release/provenance lessons under current source
assumptions; no new wisdom or update mechanism is introduced. Any historical
lesson equating event SHA, moving tag or package checksum with actual build
source is inapplicable to this logged checkout.
