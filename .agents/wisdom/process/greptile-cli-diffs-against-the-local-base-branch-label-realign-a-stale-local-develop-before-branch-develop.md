## Greptile CLI diffs against the LOCAL base branch label: realign a stale local develop before `--branch develop` (🟡 Minor)

On #26 the local `develop` label pointed at an ancient commit (`7097719`), so
`greptile review --branch develop` reviewed ~20 unrelated commits (inflated
summary, confidence over base-era code). Fix: point the local label at the
cached origin ref with `git update-ref refs/heads/develop <origin/develop SHA>`
(there is no `--base-sha` option on the CLI), then re-run. The parent brief's
"BASE = origin/develop @ SHA" is the truth; a stale local label is a lie.

