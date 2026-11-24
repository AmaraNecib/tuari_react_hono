# Issue 176 M8 semantic feature colors

Parent implementation at base5056bfad. Replace all production-feature named palette Tailwind text/background/border uses, including debt display utilities and status tones, with existing good/bad/warn theme tokens. Reuse styles.css tokens and their light/dark values; no new palette or domain rule. Success/receivables use good, errors/payables bad, warnings warn; inactive status uses muted. Soft backgrounds use existing good-soft/bad-soft/warn-soft. Ring colors follow the same semantic status tone. No seam moved; no monetary computation, labels, role filters or command changes.

Affected source includes debt legacy controls, externals, inventory dialogs, update/settings/security notices and system-log badges. This is a theme-aware visual change, requiring final integrated light/dark comparisons before owner approval. Do not treat class-string checks as browser proof. M1 child may touch the same text lines in its isolated tree; integrate its text hunks without reverting these color choices.

Verification mode focused-local / CI-final-pending. Focused affected component tests, relevant lint/typecheck and scoped palette inventory are required; final independent review and UI evidence are parent-owned for the complete issue. Do not claim full issue completion from this slice.
