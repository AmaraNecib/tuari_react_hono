# Local-only ticket and Greptile workflow design

## Decision

When the GitHub repository is unavailable, Tuari treats the checkout and cached
Git refs as the working source of truth. The implementation lifecycle continues
locally through tests, local code review, test audit/debate, and the Greptile
CLI. PR comments, hosted CI, issue mutations, pushes, and merge operations are
not required or implied.

## Interfaces and files

- `docs/local-issue-snapshot.json` stores the durable 49-ticket title snapshot.
- `docs/local-issue-status.md` records evidence-based shipped/local/unverified
  status and points to branches/commits.
- ~~`tools/gen-issue-tracker.py --offline`~~ — REMOVED. The generator was the only
  Python in the repo, nothing invoked it, and it duplicated GitHub's issue views;
  `docs/local-issue-snapshot.json` is now read directly instead.
- `feature-implement`, `engineering-workflow`, `guard`, and `code-review`
  select local refs/specs and local gates when offline.
- `cli-review` is the single-review command; `greploop --local` iterates over
  verified fixes and fresh CLI reviews.

## Review evidence

Greptile results are tied to the current `HEAD` and saved under
`.scratch/reviews/<issue-id>/` using the SHA in the filename. A successful CLI
exit is not sufficient: the result must report 5/5 with zero actionable or
unresolved findings, or an equivalent explicit clean result.

## Risks

- The ticket snapshot is historical and does not contain GitHub comments or
  current issue state.
- `origin/develop` may be stale; it must be labeled as cached and never fetched
  in local-only mode.
- Branches with a shipped base can contain duplicate or obsolete follow-up
  changes; they must be diffed before integration.
- Greptile remains an external service even though GitHub is not involved.

## Planned validation

- Parse and count the offline snapshot (49 unique tickets).
- ~~Run `python -m py_compile tools/gen-issue-tracker.py`~~ and
  ~~`python tools/gen-issue-tracker.py --offline`~~ — both obsolete: the generator
  was removed. Validate by parsing `docs/local-issue-snapshot.json` directly and
  confirming it still holds 49 unique tickets.
- Review the updated skills/docs for forbidden PR-comment/push requirements in
  local mode.
