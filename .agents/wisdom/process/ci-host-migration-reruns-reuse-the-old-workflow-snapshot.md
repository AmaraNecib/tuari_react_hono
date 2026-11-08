## CI host migration: reruns reuse the old workflow snapshot (🟠 Major)

When the CI workflow changes (e.g. self-hosted → GitHub-hosted runners, merged in
#224), a `gh run rerun` of an OLD run re-executes the old workflow (old `runs-on`).
It does NOT pick up the new workflow. Only a FRESH run does: push any commit
(empty commit without `[skip ci]` works) to create a new run that resolves the
workflow from the current merge ref. Also: a `pull_request` run whose branch is
based on pre-migration develop keeps using the old runner until develop has the
new workflow (merge-ref resolution) AND a new run fires.

**Always**: after a CI infrastructure change merges, verify `git show
origin/develop:.github/workflows/ci.yml | grep runs-on` shows the new host, then
push an empty commit to force a fresh run.

