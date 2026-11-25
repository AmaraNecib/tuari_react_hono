# Selected exact HTTP composition

Worktree: `D:/worktrees/tuari_react_hono/t3-878d4dc5-e636f6fff49dd68c`.
Base: `c428d3abb48c86c7e18c206eaada40990900221c`.
Candidate: `d2a8c4db4e392d911b1307407e3bc8e0d496aa9a`, cherry-picked locally before correction.
Mode: `focused-local / CI-final-pending`. High assurance: transport authorization and financial ownership.
Authority: local implementation only. Parent owns the three independent lenses, architecture review, integration and publication.

## Interface and selected capability

`createApp` accepts legacy `AppDependencies` or `FreshExactAppDependencies`.
Both use the existing Hono application, middleware and ORPC fetch handler.
The router already selects the exact graph. No new router, legacy service
construction, numeric money adaptation or default startup change is introduced.

The selected root has no `inventoryService`. The attachment handlers narrow
on that capability only after real session and bootstrap-owner authorization.
Upload also retains the license gate before returning temporary 503. This
avoids the candidate's unauthenticated mode disclosure. Legacy dependencies
need no new `mode` field, and their existing attachment handlers remain intact.
A direct `dependencies.mode` check was not type-safe on the legacy union;
checking mode with `in` plus equality still did not narrow the false branch
for attachment access. The capability check expresses the actual requirement
without adding a type cast or modifying either dependency interface.

Selected attachment refusal is temporary, not production parity. Reports,
system log, default activation and full attachment support remain parent work.

## Domain and test seam

The delegated seam is the real `createApp(...).request()` HTTP transport with
native selected dependencies. The test encodes ORPC's `{ json: input }` envelope
and uses slash-separated nested procedure paths. No direct router client or
injected financial service participates. Decimal strings require no ORPC
serializer metadata. Typed leaf helpers reference `AppClient`; the sole result
cast decodes the wire envelope, not a service or dependency graph.

An approved earning creates labor obligations. Wage cash, advance, offset and
repayment settle different obligations. The independent worked example is
35,000 earned, 25,000 wage cash, 5,000 advance, 2,000 offset and 1,000 repayment:
8,000 wages and 2,000 advance remain. A separate employee's generic debt is
90,071,992,547,409.93 DZD (9,007,199,254,740,993 cents), above JS safe integer.
Separating employees avoids merging that opening balance into the payroll
employee's existing payable account. No domain vocabulary or schema changed.

Plain and keyed files use genuine BetterAuth bootstrap and persisted sessions.
Requests exercise the real auth handler, organizational employee/project/current
earning APIs, financial metadata, exact payroll and generic debt. Close/reopen
replays persisted receipts and checks both totals and large debt exactly.
Anonymous and nonowner requests fail with 401; forged audit fields and retired
numeric writes fail with 400 and unchanged native total_changes. Attachment
refusal preserves auth, license and no-store behavior. Additional cases cover
origin refusal/CORS, response security headers, malformed JSON, auth rate limit
and body-size refusal. Existing create-app tests preserve default compatibility.

## Proof and architecture limits

The expected-red run reaches the candidate's actual 503-before-auth bug on
both native drivers. Earlier failing attempts exposed test setup mistakes
(shared account balance and a closed probe connection); their logs are retained
separately rather than presented as product regressions. The native handle spy
calls the real factory and selects the application path, not the last auth
probe connection.

Applied wisdom: retain the upstream body-size gate before buffering; use real
native execution rather than mocks for transport/persistence ownership. No FIFO
or transaction implementation changed. The Hono seam retains depth by reusing
all middleware and router behavior; the test helper only encodes HTTP.

Affected verification: selected HTTP and existing create-app regression files,
API typecheck, scoped lint and diff whitespace check. Contracts build and the
pinned native install are prerequisites, not dependency additions. Raw commands,
failed attempts, native exits and exact-head evidence stay ignored under
`.scratch/reviews/558-http/`. No browser, network listener, full suite or review
was run by this worker. CI acceptance and protection remain pending. This is
not completion of #558 and not production default activation.
