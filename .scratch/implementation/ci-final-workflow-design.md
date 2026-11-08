# CI-final workflow adoption

## Scope and authority

Owner requested Dockan's current workflow, updated relevant skills, affected-only local verification in background workers, local review evidence, and topic-based wisdom. Prepare this isolated branch for owner acceptance before any publication or merge. Existing PRs remain paused. Do not push, open a PR, comment, trigger hosted review or change branch protection.

Base: 8e764bc109aef63119fa40031762591ecf96b054 on origin/develop.
Reference: mani-project coordinator ca84fb31e14f10a880317fea3cc947fb6393c452, not the older root checkout.
Tier: High-assurance. A false-success aggregate or selector could permit unverified source to merge; workflow instructions control later security and recovery verification.

## Interfaces

- CI scope is computed once from exact event SHAs, with rename sides preserved. Unknown paths, missing history, manual dispatch, push to develop and the full-run label fail closed to full suites.
- A stable CI acceptance check rejects failed, cancelled, missing or unjustifiably skipped jobs. Successful selector proof is required for optional jobs to skip.
- Local verification records exact source SHA, selected paths and named failures, commands, exit codes, durations and raw log paths. Workers inherit the parent's verification mode and run affected checks only. Full local suites/builds/audits need an explicit uncertainty or coverage gap.
- The workflow, guard and related skills share one policy. Local readiness, successful hosted CI and enforced merge readiness are distinct states.
- Review reports are ignored local files. Existing tracked reports are removed from the index only and retained on disk. No new evidence-only commits or posted report files.
- Wisdom migrates losslessly into category/topic files, with an index and updated references. Historical lessons do not override current policy. Parent writes repeated lessons; workers report candidates.

## Rollout

Current develop protection returned 404 Branch not protected. Do not claim CI-final activation. After owner acceptance/publication, require GitHub Actions CI acceptance with app ID 15368, strict up-to-date checks, administrator enforcement, disabled force pushes/deletions and no bypass. Parent rechecks effective protection and current-head acceptance before merge. Only owner configures protection or accepts bypass. Pending CI does not prevent local work/review/publication when authorized, but prevents merge.

## Verification

Focused Node tests exercise event-scope fallback, critical/unknown paths, label/manual overrides, valid selected skips, missing or malformed outputs, failed/cancelled/skipped required jobs, and workflow wiring. Existing selector and workflow-asset tests remain. Verify report files remain present after untracking. Record a lossless wisdom migration manifest locally and test links/index/storage rules. No app behavior changes or dependency additions. No broad app suites, installer build or local red-on-parent replay is justified for this workflow-only scope.

Initial independent debate, test-audit and code-review use distinct read-only sessions at a committed source SHA. A bounded correction gets affected proof and one fresh combined review, with earlier source boundaries disclosed. This repository retains all three initial lenses under global policy rather than claiming the Dockan-only routine-review exception applies automatically.
