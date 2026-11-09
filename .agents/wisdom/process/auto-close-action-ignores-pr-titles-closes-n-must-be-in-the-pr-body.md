## Auto-close action ignores PR titles: "closes #N" must be in the PR BODY (🟠 Major)

On the same batch, TWO issues stayed OPEN after their PRs merged because the
closing reference lived only in the PR TITLE: #282 (PR #311 titled
"...(closes #282)") and #278 (PR #318 titled "...(#278)"). The auto-close
action parses the BODY by design (docs/lessons/gh-pr-merge-squash-issue-close.md).
The squash commit subject can carry "(closes #N)" for history, but the BODY
needs the keyword too.

**Always**: when creating a PR, put "closes #N" (or "Part of #N") in the
BODY, not just the title. After ANY merge batch, verify every referenced
issue: `gh issue view <n> --json state` and close manually with a comment if
still OPEN. Do not trust the title.




