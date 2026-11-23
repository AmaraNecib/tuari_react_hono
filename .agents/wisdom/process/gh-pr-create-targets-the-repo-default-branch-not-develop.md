## `gh pr create` targets the repo DEFAULT branch, not develop (🟠 Major)

On #177 the PR was created against `main` (the repo's default branch) even
though the workflow requires `develop` as the base. Consequences: Greptile
diffed the PR against `main`, an ancient ancestor (my branch = main +
~200 commits), and rejected with "Too many files changed for review
(582 files)". The GitHub-reported diff (13 files) was correct; Greptile
used the default branch, not the PR base.

**Always**: after `gh pr create`, verify `gh pr view <n> --json baseRefName`
is `develop`; if not, `gh pr edit <n> --base develop` BEFORE triggering
Greptile. A Greptile run against the wrong base is a wasted ~8-minute
review cycle.

