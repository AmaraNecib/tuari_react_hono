## Review process: Greptile verification, adversarial review, CodeRabbit

**Greptile findings are claims, not truth**: verify each against the current
code before fixing, grep the file for the claimed usage; dismiss invalid
findings with a line-number citation in a PR comment, never silently. On a pure
file move, an import is only stale in a file where EVERY helper that referenced
the type moved out (#202). The score is not evidence: Greptile can emit a high
score with inline findings. The clean state is a 5/5 summary with ZERO inline
threads; check `gh api repos/<o>/<r>/pulls/<n>/comments` (review threads
endpoint) before calling a PR ready.

**Adversarial review (debate critic/defender)**: when a finding says "duplicate
check", grep the WHOLE repo for the pattern before fixing one copy: "local
host" existed as `isLocalhostHostname` in the transport layer beyond
`config/index.ts` + `env.ts`; route every check through the shared helper.

**CodeRabbit** (incremental): a re-review EDITS its existing comment (same id),
it does not post a new one; "already reviewed, review finished" = no meaningful
change. Read existing comments first. Re-trigger only when the latest commit
changes reviewable code (Rust/TS/tests, NOT docs, config, .coderabbit.yaml),
when it's stuck >10 min, or when unsure. Freshness: compare the review comment's
createdAt vs the latest commit's committedDate. An "Outdated" badge does NOT
mean fixed. Read the current code. `⚠️ Warning` = advisory (mergeable; document
why in the PR), `❌ Failed` = blocker.
