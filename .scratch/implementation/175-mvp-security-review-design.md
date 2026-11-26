# #175 MVP security review design

## Scope and authority

- Base and source pin: `c363f0306668c1329a20700b8d36e26698630693` (`origin/develop`).
- Worktree: `D:/worktrees/tuari_react_hono/t3-51878482-502a4628cb7b8399`.
- Review tier: High-assurance. Security-boundary claims can misstate customer risk even though this change edits documentation only. The parent owns the three initial review lenses.
- Verification mode: `focused-local / CI-final-enforced`, supplied by the parent with strict acceptance `26837184acceptance15368` and no bypass. This task runs only bounded documentation checks; it does not run CI or runtime tests.
- Writable tracked files: `docs/SECURITY_REVIEW.md` and this design note only. Ignored verification records stay under `.scratch/reviews/175-security-report/`.

## Document contract

Write a static MVP source review pinned to the exact commit. Cover license validation and separate API entitlement policy, native desktop token custody and renderer-header/window checks, API session/origin/rate/body controls and their explicit exceptions, and the current manual update stub. Cite source and named existing test definitions. State that no tests ran for this change and that source or test definitions do not establish packaged behavior, key custody, OS keyring behavior, Tauri IPC ACL execution, or production proxy configuration.

Threat framing distinguishes untrusted network/renderer input from a local administrator who can modify their own files or application. Do not claim anti-tamper protection, certification, complete audit coverage, a vulnerability-free product, customer readiness, or an installed/verified update. Keep automatic updater signing, release provenance investigation, and owner-only trust decisions out of scope.

## Verification and review

Check Markdown link targets and report claims against this pinned source. Run the repository's pure TypeScript prose detector against only the two new Markdown files, capturing first-attempt native exit/stdout/stderr/time in a fresh ignored log directory. Run `git diff --check` on named staged files and commit the complete documentation scope. Do not run tests, builds, native tools, browser checks, or heavy work. Record exact commit and source pin for parent-owned reviews.

## Wisdom

Applied: `security/a-resettable-recovery-file-must-not-hold-the-trial-anchor.md` prompted explicit boundaries around license state and recovery-related claims; `desktop/env-clear-on-the-sidecar-child-drops-systemroot-and-the-bundled-node-aborts-without-it.md` reinforces that source tests cannot substitute for packaged-runtime evidence. Excluded unrelated multipart, dependency-audit, packaging-path and migration lessons. No code seam moved.
