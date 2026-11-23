## MSYS path conversion mangles `git show origin/develop:path` (🟡 Minor)

On Windows Git Bash, `git show origin/develop:.github/workflows/ci.yml` becomes
`origin\develop;.github\workflows\ci.yml` and fails with "ambiguous argument".
Prefix the command with `MSYS_NO_PATHCONV=1` (or use `git cat-file -p`).

**Always**: use `MSYS_NO_PATHCONV=1 git show <rev>:<path>` for rev:path lookups
on Windows.

