# #543 workforce validation identifiers

- Worktree: `D:/worktrees/tuari_react_hono/t3-b1f9bb54-93e2b363bda15bf7`
- Base: `fc157af72650e350153647833753f36fd879b165`
- Verification mode: `focused-local / CI-final-pending`
- Tier: high-assurance; reachable exact-money validation and conservation failures must keep their contract paths.
- Scope: stable identifiers for salary-reference precision and earning precision, positive days, conservation, ordering, and duplicate IDs; Arabic text in the active web locale; RPC display translates known identifiers while retaining field paths. No language negotiation, English resource, salary wire-shape change, or earnings UI.
- Vocabulary: a validation issue carries a stable message identifier and a Zod path; the web adapter translates only registered identifiers at display time and preserves the path as a dotted field for future forms.
- Seam: `translateRpcValidationIssues` adapts ORPC `data.issues` for future field consumers. Existing toast extraction uses that adapter and continues passing unknown server messages through literally.
- Duplication: service-level salary-reference revalidation remains necessary at its service seam and now emits the same identifier; schema parsing remains the external contract check.
- Architecture: no seam moved; reusable adapter was added at the existing RPC error-display seam.
- Applied wisdom: verify validation path reachability; wire locale keys to actual display use; do not pass arbitrary server text to `t()`. The explicit identifier allowlist also keeps the locale-key check aware of schema-driven translations.
- Excluded: broad validation refactor, forms, locale infrastructure, translation of arbitrary server text, unrelated financial flows, and files owned by the parallel contracts task.
