# Engineering Workflow

This document is the canonical lifecycle for Tuari changes. It supports the
normal remote repository (**the default**) and a **local-only fallback** for
when the GitHub repository is genuinely unreachable or the user asks for it.

## Repository modes

| Mode | Source of truth | Allowed review transport | Finish state |
| --- | --- | --- | --- |
| **Remote** (default) | Fresh `develop`, issue/PR data, CI | PR/CI plus Greptile CLI or hosted review | PR opened/updated; merged only when the user authorizes it |
| Local-only (fallback) | Current checkout, local branches/worktrees, cached refs, `docs/local-issue-status.md` | Greptile CLI (`greptile review --json`) | Locally verified and ready for later integration; never "merged" or "closed" |

Selecting local-only mode is not a downgrade in code quality. It removes the
GitHub transport dependency while retaining the local tests, two-axis review,
test audit, and adversarial debate where required.

**Greptile is not part of the gate.** The CLI is unavailable on this machine
(`access_denied`) and the hosted review is out of quota, so no step may depend on
it and a reviewer must not report its absence as unfinished work. The gate is the
local review skills: **`debate`** (critic + defender, then synthesis),
**`code-review`** (Standards + Spec), and **`test-audit`**. Run them on the pushed
head; a verdict on an earlier commit does not count.

## Local ticket storage

The old issue tracker was generated into ignored `tmp/issue-tracker.html` from
`gh issue list`. That file is a presentation cache, not a durable source, and
`.scratch/issues/` is intentionally ignored. The durable offline sources are:

- `docs/local-issue-snapshot.json`: the 49-ticket title snapshot;
- `docs/local-issue-status.md`: evidence-based shipped/local/unverified status;
- `.scratch/implementation/<issue-id>-design.md`: implementation decisions;
- `.scratch/reviews/<issue-id>/`: review evidence;
- local branches and cached refs: implementation material.

The snapshot is the durable offline record; read it directly rather than
regenerating anything. The former `tools/gen-issue-tracker.py` HTML generator was
removed: it was the only Python in the repository, no script or CI step invoked
it, and it duplicated the GitHub issue views while carrying its own escaping
bugs. If a visual board is wanted again, build it in the repo's own toolchain
(Node/TypeScript) so it runs in CI and can be tested.

## Feature lifecycle

```
Local ticket/spec
    ↓
Pin local base SHA + review tier
    ↓
Design (.scratch/implementation/)
    ↓
Implementation (TDD + Playwright where applicable)
    ↓
Guard Phase 1 — local pre-review checks
    ↓
Quality check — relevant skills
    ↓
Debate — High-assurance only
    ↓
Test audit — Standard + High-assurance
    ↓
Code-review — local Standards + Spec axes
    ↓
Guard Phase 2 — local pre-report checks
    ↓
Greptile CLI review (`cli-review`)
    ↓
Greploop local fix/review loop when findings exist
    ↓
Guard Phase 3 — local pre-report gate
    ↓
Capture wisdom + report local handoff
    ↓
[Remote restored, user approves] rebase → fresh checks → PR/CI lifecycle
```

`feature-implement` is the mandatory orchestrator. Do not run a later phase
without recording the earlier gate, its commands, and its result.

## Source-only change policy

Builds and test commands are allowed to generate local artifacts, but those
artifacts must not enter a source PR. Common examples are `dist/`, `target/`,
sidecar binaries, Tauri schemas, coverage directories, Playwright reports,
SQLite files, and `node_modules/`.

Before committing or pushing a local PR, inspect the exact file set:

```bash
git diff --name-only <base-sha>...HEAD
git status --short --ignored
```

Stage named source/config/test/evidence files only. Never use `git add -A` and
do not add a generated file just because a build command created it. If the
base contains a legacy tracked generated artifact, leave it out of the feature
diff and document it rather than copying a fresh build output.

## Coverage policy

The API coverage gate (see `apps/api/vitest.config.ts`) keeps lines,
statements, functions, and branches all at a strict 100% - "tests pass" keeps
its meaning. The #242 report code contains defensive branches that are
provably unreachable given the surrounding logic; those are handled with a
commented `/* v8 ignore */` escape (which excludes them from the numbers), not
by lowering the threshold, so any REACHABLE untested branch still fails the
gate. An aggregate floor would let real gaps pass silently, so it is
intentionally not used. A branch marked unreachable must be documented in a
comment and genuinely impossible, not a way to dodge a real hole.

## 1. Pin the base and tier

Start from the repository root:

```bash
git rev-parse --show-toplevel
git status --short --branch
git rev-parse develop
git merge-base develop HEAD
```

Use local `develop` when present. A cached `origin/develop` may be used only as
an explicitly recorded fallback; do not fetch while in local-only mode. Pin one
base SHA and use it for design, code review, and evidence.

Choose one tier:

| Tier | Applies to | Required lifecycle |
| --- | --- | --- |
| Lightweight | Truly non-reviewable files only (`.gitignore`, `.gitattributes`, `LICENSE`, scratch) | Guard 1 → relevant quality check → report |
| Standard | Code, tests, CI, workflow, config, skills, UI, API | Guard 1 → quality check → design pass → test audit → code review → debate → Guard 2 → Guard 3 |
| High-assurance | Authz/RBAC, licensing/crypto, financial calculations, security | Standard plus debate |

Workflow files and skills are Standard because they change future engineering
behavior. Do not label them Lightweight to avoid review.

## 2. Design

Before production changes, create:

```
.scratch/implementation/<issue-id>-design.md
```

It must specify public interfaces, dependencies, planned unit/integration and
Playwright tests, risks, deviations from architecture, mode (`local-only`),
and the pinned base SHA. For an issue from the offline snapshot, reference
`docs/local-issue-status.md` instead of trying to fetch a deleted issue.

## 3. Implementation

Use the `implement` skill and TDD at explicit seams.

Every user-facing feature includes a Playwright test in `tests/e2e/`. Business
logic includes meaningful unit/integration tests. Run relevant checks during
implementation:

```bash
pnpm typecheck
pnpm test:web
pnpm test:api
```

For Rust Core changes:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --lib -- -D warnings
```

Run these checks locally so a predictable failure surfaces in the worktree,
not first on an external system.

## 4. Guard Phase 1: pre-review

Run the local pre-review gate before any deeper review:

```bash
pnpm --filter @tuari/contracts build
pnpm typecheck
pnpm lint
pnpm test:api
pnpm test:web
```

Also run Rust test/clippy and repository architecture guardrails when relevant.
Stop on failure. A pre-existing failure must be reproduced on the pinned base
and documented; it must not be silently ignored.

## 5. Quality check

### Design pass on the finished diff — mandatory, and it is a merge gate

Load the three design skills against **the diff you just wrote**, not only
against the new modules in it. The point is that a PR does not merge and get
"cleaned up later": the mess compounds, and after two or three such PRs the
codebase is harder to change than when it started.

| Skill | What it asks of this diff |
| --- | --- |
| `domain-modeling` | Does the diff use the project's vocabulary? Did it introduce or resolve a term that belongs in `CONTEXT.md`? Is a new domain rule stated once, in the right place? |
| `codebase-design` | Is anything the diff added **shallow** (run the deletion test)? Is a seam where it should be, and does it have two adapters or is it hypothetical? Is the interface the test surface? Did the diff introduce duplication that will drift? |
| `improve-codebase-architecture` | What friction did this diff create? List the deepening opportunities it reveals — fix the ones inside this PR's scope, file the rest as issues with the finding, and say why the remainder is justified. |

**Output** (part of the review evidence, `.scratch/reviews/<issue-id>/design-pass.md`):
what the pass found, what it fixed in this PR, what it filed, and the reasoning
for anything deliberately left. "Nothing found" is a valid result but it must be
stated — silence is not evidence that the pass ran.

This applies to every PR, including small ones: a five-line change that adds a
second copy of a rule is exactly how drift starts.

Separately, and periodically rather than per PR, run
`improve-codebase-architecture` over the **whole** codebase (it produces an HTML
report of deepening candidates). That is how debt accumulated before this rule
gets retired.

### Select relevant skills rather than loading every skill:

| Change | Skill |
| --- | --- |
| New module/interface/architecture | `codebase-design` |
| Complex state/edge cases | `diagnosing-bugs` |
| Domain entities/terms | `domain-modeling` |
| Production code | `code-review` |
| UI/visual design | `frontend-design`, `web-design-guidelines` |
| UI polish | `redesign-existing-projects` |
| shadcn/ui | `shadcn` |
| Component API design | `vercel-composition-patterns` |
| React performance | `vercel-react-best-practices` |
| Tauri runtime/IPC | `tauri-v2` |
| Hono routing/middleware | `hono` |
| Playwright architecture/selectors | `playwright-best-practices` |
| Accessibility/keyboard/RTL | `accessibility` |

## 6. Debate: High-assurance only

Run the `debate` skill with the pinned base. Preserve critic and defender
outputs at:

```
.scratch/reviews/<issue-id>/<head-sha>-debate.md
```

The parent agent decides what to fix, defer, or reject; do not treat a score as
proof that a finding is valid. A lane may propose a follow-up PR for work that
is genuinely outside scope, but must ask the parent first with the proposed
follow-up and dependency/order impact. No silent deferrals.

## 7. Test audit: Standard and High-assurance

Run `test-audit` against the current diff. It checks edge/error/empty states,
assertion quality, E2E coverage, and shallow tests. Save:

```
.scratch/reviews/<issue-id>/<head-sha>-test-audit.md
```

## 8. Local code review

Run `code-review` against the fixed point:

```bash
git diff <base-sha>...HEAD
git log <base-sha>..HEAD --oneline
```

The two axes remain separate: the Standards axis checks repo rules and the
smell baseline; the Spec axis checks the local design, local issue snapshot,
and any checked-in PRD/spec.

If the issue body is not available locally, the Spec axis must say "no spec
available"; it must not guess. Save:

```
.scratch/reviews/<issue-id>/<head-sha>-code-review.md
```

Fix actionable findings, rerun local checks, then regenerate evidence. Greptile
findings are claims: verify them in the current code before changing anything.

## 9. Guard Phase 2: local pre-Greptile gate

Verify all applicable local checks, evidence freshness, and handoff state.
Evidence filenames must contain the final reviewed `HEAD` SHA. If the code
changes after review, evidence is stale and must be regenerated.

A clean working tree is preferred. If the user explicitly wants an
uncommitted local handoff, list every uncommitted file and do not call it ready
to integrate. Never use `git add -A`; stage only named files when committing.

## 10. Local review on the pushed head (the Greptile step, replaced)

Greptile is unavailable (`access_denied` locally, quota exhausted on the host), so
this step is the local review skills against the pushed head — see the note at the
top of this document. Run `debate`, `code-review` and `test-audit` in fresh
context, fix every high and medium finding (and the lows unless provably wrong),
and prove each behaviour fix with a test that fails on the pre-fix code. A verdict
on an earlier commit does not count as a review of the pushed head.

Greptile review is now performed locally from the checkout, not by scraping PR
comments. The CLI may send the committed diff to Greptile's service, but no
GitHub repo, PR, branch push, or comment is required. The CLI excludes
uncommitted files, so commit intended files explicitly or report the exact
uncommitted review boundary; never claim those files were reviewed.

First run `cli-review`:

```bash
git rev-parse --show-toplevel
greptile whoami
greptile review --json --branch <base-branch>
```

Always pass the pinned base branch/ref. Omitting it can make the CLI compare
against the repository default branch and review an unrelated, enormous diff.
If the CLI is missing, ask before installing it. If authentication is missing,
ask the user to complete `greptile login`. Prefer JSON and preserve the raw
result. A successful command only means the review ran; inspect its status,
score, and findings.

When findings are actionable, run `greploop --local`. It may iterate over local
fixes and re-review the current checkout, up to the skill's maximum iteration
count. It must not:

- call `gh`, `glab`, or PR/MR APIs;
- post comments or resolve remote threads;
- push, shelve, or create a PR;
- use `git add -A` or silently commit unrelated files;
- continue from stale review output after a code change.

Store evidence for a ticket as:

```
.scratch/reviews/<issue-id>/<head-sha>-greptile-local.json
.scratch/reviews/<issue-id>/<head-sha>-greptile-local.md
```

The gate is clean only when the latest result reports confidence 5/5 with zero
unresolved/actionable findings, or an equivalent explicit "no actionable
findings" result. Check the current code before dismissing a false positive.

## 11. Guard Phase 3: local pre-report

In local-only mode, verify:

- all applicable local checks are green;
- test-audit/debate/code-review evidence exists and matches the final code;
- the latest Greptile CLI result is for the final code and is clean;
- deferred work is recorded in `docs/local-issue-status.md` or a follow-up
  design/ticket;
- the report does not imply CI, PR, merge, or issue closure.

There is no "wait for CI" step while GitHub is unavailable.

## 12. Wisdom and report

Run `capture-wisdom` when a finding or failure is durable. The report must state:

- ticket, branch/worktree, mode, base SHA, and final HEAD SHA;
- checks and exact results;
- local review evidence paths;
- Greptile score/findings and local loop iterations;
- remaining work and whether it is shipped, local-only, deferred, or unknown;
- explicit parent decisions for any deferral and any lane/worktree reorder.

## Completion definitions

### Local-only ready for integration

- local verification passes;
- required local quality reviews pass;
- current evidence is present;
- Greptile CLI/Greploop reports no actionable findings;
- branch and working-tree state is accurately reported.

This is **not** a merge or issue closure.

### Remote-ready (only after restoration and explicit approval)

Rebase/compare against a freshly fetched `develop`, rerun the complete local
lifecycle, then use the PR/CI lifecycle. Verify the PR base and issue references
before triggering any hosted review. Never infer issue closure from a title or
cached state.

## Two-layer review model

1. **Local agent review**: quality skills, test audit, debate where required, and
   `code-review` against a pinned base.
2. **Greptile CLI review**: independent automated review of the current local
   checkout, with `greploop --local` for iterative fixes.

The second layer is not a replacement for tests or the two code-review axes.
Neither a green command nor a 5/5 score excuses unresolved inline/actionable
findings.
