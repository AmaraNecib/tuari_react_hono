# Debate — issue #473 (head `fe9a4fbb`)

Critic and defender in fresh context over the PR diff
(`d6164c65...fe9a4fbb`); the round-4 delta is `f104f403...fe9a4fbb`.

- mode: remote
- base SHA: `d6164c651a42be41f5b4824a53fa88e06e8a1ffa`
- reviewed HEAD: `fe9a4fbb61cbce0449427744c29a9c1e4231490b`
- tier: Standard

## Critic

1. **The scanner is a text heuristic, not a parser.** A `timeZone` supplied via
   a spread (`{ ...opts }`) is not seen and the call is reported. — Accepted as
   intended: a spread is exactly the "I forgot the zone" case the rule exists to
   catch, and the doc now says the call is reported. Documented, not a defect.
2. **`readTimeZoneValue` accepts any unhandled nonempty token.** `timeZone: )`
   would read as usable. — Malformed source cannot compile, so the heuristic
   cannot reach lint/test as a real false negative. No fix.
3. **Template-literal `${…}` interpolation is not descended.** — No such
   interpolation exists in `apps/web/src`; the function documents the limit.
4. **Two comment-skipping readers** (`stripComments` vs `findMatchingParen`). —
   Different outputs (content vs original positions); see the design pass. Not
   worth unifying for two call sites.
5. **A `timeZone` key in a nested non-options object counts.** — Same class as
   the pre-existing heuristic; the rule's job is catching a re-added bare call,
   not type-checking. The production scan has a non-vacuity guard
   (`files.length > 0`).

## Defender

The delta fixes two real rule defects with the smallest possible change: quoted
zones (which the rule previously rejected, breaking `lint` and `test`) now pass,
and commented-out options (which the rule previously accepted while the call
used the machine zone) now fail. The self-tests pin both directions and were
proven red on the pre-fix scanner
(`.scratch/tmp/473/old-scanner.cjs`: `quoted FLAGGED/FAIL`, `commented passed`).
Every critic point is either documented, unreachable in compiling code, or a
pre-existing heuristic limit.

## Verdict

No high or medium findings. The three low heuristic limits are documented in the
function contract and do not warrant a fix in this PR.
