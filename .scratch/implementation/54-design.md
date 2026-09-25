# Issue #54 — Fix auto-close-issues workflow

- mode: remote (GitHub reachable; gh authenticated as AmaraNecib)
- ticket: GitHub issue #54 [bug], https://github.com/<owner>/<repo>/issues/54
- branch: `fix/issue-54-auto-close-workflow`
- base: origin/develop @ a23eaaf (verified live, not cached)
- review tier: Standard (CI/workflow change)

## Symptom

Job `close-linked-issues` fails on every run (32641681287, 32612598672,
32610705291, and ~15 more back to 2026-08-18). All log fetches return
"log not found" (retention/expiry), check-run annotations are gone too.

## Diagnosis (evidence-based)

The jobs API shows the true signature — this was NEVER a script bug:

```
jobs[] -> {"conclusion":"failure","steps":[],"runner_name":"",
           started_at==created_at, completed 3s later}
```

Zero steps executed, no runner ever assigned, dead in 3–4 seconds. That is a
**startup failure before job setup**, not shell logic. Cross-workflow
comparison seals it:

| workflow | runs-on | outcome |
| --- | --- | --- |
| ci.yml (Lint/Typecheck/Test/Build/E2E/Greptile) | `self-hosted` | success on same commits |
| auto-close-issues.yml | `ubuntu-latest` | failure, zero steps, ~3s |
| nightly.yml | `windows-latest` | failure, **zero jobs at all** |
| release-metadata.yml | `ubuntu-latest` | failure, zero jobs |
| beta.yml | `windows-latest` | (same family) |

This repo's **GitHub-hosted runners are unavailable** (private repo without
hosted-runner minutes / disabled in settings). Every hosted-runner job fails
at allocation; every self-hosted job succeeds. The auto-close workflow is the
only one in the repo that matters daily and targets `ubuntu-latest`.

Secondary finding while auditing the script under `set -euo pipefail`: the
inline script is actually well-guarded (`|| true` on every grep pipeline,
guarded arithmetic, `if !` around `gh issue close`). No unbound-var /
pipefail trap found. But the header promises run-summary visibility that the
script never delivers, and nothing validates the plumbing end-to-end.

## Fix design

1. **Root cause**: `runs-on: ubuntu-latest` → `runs-on: self-hosted`
   (Linux runner — proven by webkit2gtk/apt steps in ci.yml; bash available;
   matches every other workflow in the repo).
2. **Extract** the close logic into `scripts/ci/close-linked-issues.sh` so it
   can be tested locally without GitHub Actions.
3. **Backend: bash + curl + jq — NOT the `gh` CLI.** Live probe of the
   self-hosted runner (2026-08-24): `gh` MISSING, no passwordless sudo,
   `curl` + `jq` present. Installing gh was not possible from the workflow,
   so the script talks to the REST API directly with curl and parses with
   jq (both present). Single GET per issue (state + body +
   sub_issues_summary from one response), PATCH+comment for the close.
4. **Validation harness**: `workflow_dispatch` trigger with inputs
   `pr_number` + `dry_run` (default **true**) so the exact production path
   can be exercised post-push without opening throwaway PRs and without
   risking real closes.
5. **Run summary**: Closed/Skipped table appended to `$GITHUB_STEP_SUMMARY`
   (fulfils the header promise). Preflight errors (`curl`/`jq`/token) fail
   loudly with `::error::`.

## Live validation findings (dispatch harness on self-hosted, 2026-08-24)

These bugs were only visible ON the runner — local mocked/CLI runs could not
reproduce them:

- **`bash + gh` impossible**: runner has no `gh` and no passwordless sudo
  (probe). curl + jq are present → REST-API backend.
- **GITHUB_TOKEN needs `pull-requests: read`** to fetch a PR body via
  `GET /issues/N` (403 observed without it even through the issues
  endpoint — a PR number resolves to pull-request data). Plain-issue reads
  (state/body/subs) work with `issues: write`. Dispatch harness now reads
  PR #45 and issue #54 fine; both runs closed-safe with correct SKIP
  reasons.
- **Merged-into-develop qualification** (Greptile CLI finding rounds 1-2):
  the workflow `if:` only gates the pull_request trigger, so the dispatch
  harness with `dry_run=false` could close issues from an unmerged PR. The
  script refuses to close anything unless `merged=true` and
  `base.ref=develop` (checked once, DRY_RUN exempt). Fields come from the
  PULLS endpoint (GET /issues/N for a PR carries no `.merged`/`.base` —
  verified live). Production path passes PR_BODY from context; the harness
  fetches body + qualification. Greptile final: 5/5, 0 comments.
- **Two bash traps that hid diagnostics**: (1) echoing inside a command
  substitution corrupts the captured value (`PR_BODY=$(api ...)` captured
  the diagnostic lines); (2) a global var assigned inside a function that
  runs inside `$(...)` is lost (subshell). Final design: `api()` emits the
  VALUE on stdout only and appends diagnostics to a temp FILE flushed to the
  job log via `show_api_diag()` after each call. This is also the
  permanent "clear echo output" the header promises.

## Tests

`scripts/ci/test-close-linked-issues.sh` — local bash harness that shadows
`gh` with a fake on PATH and runs the scenario matrix:

1. happy path: OPEN issue, plain "Closes #N" body → CLOSED
2. already-closed issue → SKIP (state)
3. parent with open sub-issues → SKIP (sub-issues)
4. issue marks remaining work in an OPEN issue → SKIP (remaining)
5. "Closes #201 / Part of #200": #201 closes despite #200 open (lineage OK)
6. self-reference partial: "Part of #N" for the same #N → SKIP
7. mid-word match ("unresolved #5") extracts nothing → clean exit 0
8. no refs in body → exit 0
9. DRY_RUN=1 logs "WOULD CLOSE" without calling close
10. sub-issues field absent from response → fails open, still closes
11. whole-API failure → job survives (exit 0), safe SKIP (no wrongful close)
12. close failure (PATCH fails) → WARN, exit 0
13. missing GH_TOKEN → clear ::error:: and exit 1

Plus live proof on the self-hosted runner: PR #45 → "Closes #42" →
SKIP (state closed); issue #54 → "#48" → SKIP (state closed); both green.
Next real merge into develop is the only remaining unverifiable step.

## Risks / constraints

- The close script depends on curl + jq on the self-hosted runner — BOTH
  confirmed present by the live probe; no sudo needed.
- Whether the fix fully delivers #54 requires one REAL merge into develop
  (pull_request closed event path) — stated as unverifiable-until-merge in
  the report. The workflow_dispatch dry-run validates runner allocation
  + full script execution on the real closure path.
- Unit-only round; no Playwright (per brief). E2E owned elsewhere.
