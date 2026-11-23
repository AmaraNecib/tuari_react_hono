## CI migrated to GitHub-hosted runners: self-hosted runs are dead (🟠 Major)

The self-hosted runner was retired; ci.yml now runs on ubuntu-latest (migrated via PR #224). Runs queued on the old workflow either fail on infra (e.g. `test:coverage` exit 1 with local pass) or queue forever. If your branch's ci.yml still says `runs-on: self-hosted`, align it with the merged migration (copy `origin/develop`'s ci.yml) or merge develop in.

**Always**: after a "CI host changed" notice, check `git diff HEAD origin/develop -- .github/workflows/ci.yml` and verify the PR's workflow matches the migrated one; when an old-runner run fails but the same command passes locally, cancel/re-run on the new workflow rather than debugging the code.

