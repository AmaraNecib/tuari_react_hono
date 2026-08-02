
---

## Post-evidence delta (76f57aa - Greptile round)

Greptile (4/5 -> 5/5) flagged safeValidate's ZodValidationError.errors access:
zod v4 exposes `issues`, not `errors`, so with a real Zod schema the
`errors?.map(...) || []` fallback silently returned `fieldErrors: []`
(pre-existing behavior; safeValidate has no production callers). Fixed in
76f57aa: the type now declares both `errors` (test double / zod v3) and
`issues` (zod v4), and the reader is `(zodError.issues ?? zodError.errors ?? []).map(...)`.
Test double still resolves via `errors`; validator tests (8) pass. Greptile
re-review: 5/5, no files needing attention.
