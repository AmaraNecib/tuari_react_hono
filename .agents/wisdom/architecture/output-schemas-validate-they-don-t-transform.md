## Output schemas validate, they don't transform (🟡 Minor)

On #221, `changeDbKeyOutputSchema`'s failure member used `error: z.string().trim().min(1)` to reject blank-looking errors. Greptile (4/5 → 5/5 after the fix) flagged `.trim()` as a *transform* on an output schema: it silently rewrites server-emitted values rather than rejecting them. The pure-validator form is `z.object({...}).refine(({ error }) => error.trim().length > 0, ...)`. Same rejection behavior, zero mutation. On INPUT schemas transforms are fine (normalize what the client sent); on OUTPUT schemas prefer `refine`/`regex` so the server's emitted value crosses the wire byte-identical.

**Always**: on output schemas, express blank/format rules as validators (`refine`, `regex`, `min`), never as transforms (`trim`, `toLowerCase`).

