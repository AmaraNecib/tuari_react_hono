# CodeRabbit Review Behavior

## How CodeRabbit handles re-reviews

CodeRabbit is an **incremental review system**. When you trigger `@coderabbitai review`
after a new commit on the same PR:

- CodeRabbit **edits its existing comment** (the one with Pre-merge checks)
  rather than creating a new one — same comment ID, updated content
- The "Action performed" acknowledgment is also edited (not replaced)
- Inline file-level comments ("Nitpick", "Outdated") persist with "Outdated"
  badges after the file is modified
- If CodeRabbit says "incremental review, already reviewed, review finished"
  without producing new content, it means no meaningful change was detected

## When to read comments vs re-trigger

**Read the existing comments first.** Don't automatically re-trigger.

Re-trigger only if:
1. The latest commit changes **reviewable code** (Rust, TypeScript, tests —
   NOT docs, .md files, config, .gitattributes, .coderabbit.yaml)
2. CodeRabbit is stuck/not responding for >10 minutes
3. The agent is unsure and needs a fresh look

**Docs-only commits don't need re-trigger.** The old review is still valid
for the code changes.

## How to check if review is fresh

1. Get the latest commit timestamp:
   ```bash
   gh pr view <num> --json commits --jq '.commits[-1].committedDate'
   ```
2. Get CodeRabbit's recent comments:
   ```bash
   gh pr view <num> --comments --json comments \
     --jq '.comments[] | select(.author.login == "coderabbitai") | {created: .createdAt, edited: .lastEditedAt, body_preview: (.body[0:300])}'
   ```
3. Compare: if the CodeRabbit review comment was created AFTER the last commit,
   it's fresh. If BEFORE, check if the latest commit changes reviewable code.

## Inline "Outdated" comments

- An "Outdated" badge means the file/line has changed since the comment was made
- **Do not assume "Outdated" means fixed** — read the current code to verify
- If the concern is still present in the current code, it's still an open finding

## Pre-merge checks (⚠️ Warning vs ❌ Failed)

- `⚠️ Warning` checks (yellow) are advisory — the PR can still merge
- `❌ Failed` checks (red) are blockers — do NOT merge
- Warnings like "Out of Scope Changes" or "Linked Issues" with "serde missing"
  may be false positives (owned infrastructure, pre-existing deps, etc.)
- Document why a warning is acceptable in the PR description to avoid confusion
