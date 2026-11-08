## Object-spread widens status literals; trailing spread preserves them (🟠 Major)

In TypeScript, `{ ...cur, status: "ENDED" }` where `cur` is a typed record with
`status: "ACTIVE" | "ENDED" | "ARCHIVED"` infers `status: string` and fails
assignment. But `{ ...h, endDate, status: "ENDED", ...a, updatedAt: endDate }`
(trailing spread after the literal) preserves `"ENDED"`. Fix: `status: "ENDED" as const`.

This only surfaced after typing the in-memory `Map<string, any>` store. The `any`
was hiding it. When removing `any` from a store/adapters, expect literal-widening
errors at every `{ ...record, status: "X" }` mutation; grep for `status: "` overrides
and add `as const` proactively.

**Always**: after typing Maps, run typecheck immediately; fix literals with `as const`.

