## Verify a flagged validation path is even reachable before "fixing" it. Dead code may be the real answer (💡 Design Principle)

Issue #278's audit quoted `input-validator.ts:41,59` (a `VALIDATION` ORPCError,
"Invalid input: validation failed", no field data) and blamed it for web users
seeing fallback toasts. Investigation showed the middleware `*Validated`
variants calling it were **never invoked in any commit** (`git log -S
queryAuthValidated` → only the introducing commit, no usage ever). The real
production path is the ORPC contract wire gate (every procedure is
`implement(appContract)`), which already attaches `data.issues` with field
paths. So the issue's Option A ("fix the VALIDATION error") would have
"fixed" code nothing calls; Option B (drop the double validation) deleted the
trap instead. The web's magic-string check (`message !== "Input validation
failed"`) worked against the wire gate by luck, and the fix was to remove
the string dependence entirely (issues-first), not align it to a dead path's
message.

**Always**: when an issue/audit points at a "wrong" error path, first prove
it's reachable (`git log -S <symbol>`, repo-wide rg, wire probes). If it's
dead code, delete it (single source of truth) rather than making it "correct". Keeping a correct-but-unused path preserves the trap for the next audit.

