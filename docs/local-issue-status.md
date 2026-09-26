# Local issue status

This is the offline issue ledger for the Tuari repository. It was reconstructed
on **2026-08-17** from the last local issue-tracker snapshot
(`tmp/issue-tracker.html`), local branches, implementation designs, review
evidence, and the cached `origin/develop` ref (`6a678c0`).

## Important limitations

- The snapshot contains **49 tickets**. It is not a live GitHub query.
- `.scratch/issues/` is intentionally ignored by `.gitignore` and is currently
  empty. The old issue tracker was a generated, ignored HTML view; it was not a
  durable ticket store.
- `origin/develop` is only the last cached remote ref. At the time of this
  audit, `git ls-remote origin` and `gh issue list` both returned “repository not
  found”. No push, fetch, PR, or issue mutation was attempted.
- “Shipped” below means the implementation is present in the cached
  `origin/develop` tree. GitHub issue state may still say open because issue
  closure was never synchronized.
- “Local follow-up” means a local issue branch contains additional source or
  test work and review evidence that is **not** in cached `origin/develop`.
  Those branches are valuable recovery material, but they are not shipped.

## Status legend

| Status | Meaning |
| --- | --- |
| **Base shipped; local follow-up remains** | The main implementation or an equivalent merge is in cached `origin/develop`, but a local branch still contains unmerged follow-up work. Review the branch before calling the ticket complete. |
| **Implemented and reviewed locally; not shipped** | A local branch has implementation plus design/review evidence, but no corresponding implementation is in cached `origin/develop`. |
| **No issue-specific local evidence** | No issue branch, design, or review evidence was found in the local refs inspected. This does not prove that unrelated work never touched the area. |
| **Reference / parent** | A map, specification, or parent ticket. Do not launch implementation directly from this row. |

## 49-ticket inventory

| # | Title | Local evidence status | Evidence / next action |
| ---: | --- | --- | --- |
| 271 | i18n: 69 raw-key calls, resource drift, and CI key check | **Base shipped; local follow-up remains** | `bb144f3` is in cached `origin/develop`; `refactor/issue-271-i18n-resources` has later source/evidence work. |
| 275 | A11y semantics and focus traps for four custom modals | **Base shipped; local follow-up remains** | `b182705` is cached; `refactor/issue-275-tour-a11y` has later test/review work. |
| 282 | Web hygiene and production HTML/dependency cleanup | **Base shipped; local follow-up remains** | `3d4ebd1` is cached; `refactor/issue-282-web-hygiene` has later hygiene/test polish. |
| 214 | Thin the transport seam | **Implemented and reviewed locally; not shipped in cached `develop`** | Design + review evidence ships with the recovery-line port stack (`.scratch/implementation/214-design.md`, `.scratch/reviews/214/`). |
| 230 | Reject whitespace-only passwords | **Base shipped; local follow-up remains** | `24b8aa3` is cached; `refactor/issue-230-whitespace-pw` has the reviewed boundary/E2E follow-up. |
| 232 | Adapter-level company transaction tests | **Implemented and reviewed locally; not shipped** | `refactor/issue-232-tx-tests` has implementation and review evidence; its test changes are not in cached `origin/develop`. |
| 241 | One transport branch for desktop/browser | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent/map context: #235. |
| 242 | Reports should stop returning dashboard stubs | **Implemented and reviewed locally; not shipped in cached `develop`** | Design + review evidence ships with the recovery-line port stack (`.scratch/implementation/242-design.md`, `.scratch/reviews/242/`). |
| 243 | Collapse table primitive families | **Implemented and reviewed locally; not shipped in cached `develop`** | Design + review evidence ships with the recovery-line port stack (`.scratch/implementation/243-design.md`, `.scratch/reviews/243/`). |
| 244 | One source of truth for the workspace page union | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent/map context: #235. |
| 247 | Recovery-key RPC wire tests | **Base shipped; local follow-up remains** | Equivalent passthrough merge `abf769a` is cached; `refactor/issue-247-rpc-wire-tests` has additional boundary tests/evidence. |
| 259 | Config-module deferred coverage branches | **Implemented and reviewed locally; not shipped in cached `develop`** | Design + review evidence ships with the recovery-line port stack (`.scratch/implementation/259-design.md`, `.scratch/reviews/259/`). |
| 263 | Employee-create role validation mismatch | **Base shipped; local follow-up remains** | `96a5eca` is cached; `refactor/issue-263` contains the reviewed E2E/admin-guard follow-up. |
| 265 | Rekey persistence, graceful shutdown, schema executor | **Base shipped; local follow-up remains** | `d3ea907` is cached; `fix/issue-265-rpc-restore` contains later rekey failure handling and review evidence. |
| 277 | Move debt sign helpers to contracts | **Base shipped; local follow-up remains** | `8800f9a` is cached; `refactor/issue-277` contains the reviewed negative-balance test round. |
| 278 | Preserve Zod issues through the ORPC validation error | **Base shipped; local follow-up remains** | `eebaa45` is cached; `refactor/issue-278-zod-validation` contains later web/API test and cleanup work. |
| 281 | Self-host fonts and preload Arabic font | **Base/equivalent shipped; local follow-up remains** | Related font merge `d00ad15` is cached; `refactor/issue-281-fonts` contains a later build-output/test refinement. |
| 284 | Repository hygiene and mobile drawer dismissal | **Base shipped; local follow-up remains** | `782ff48` is cached; `refactor/issue-284-repo-hygiene` contains later CSS/DOM and test evidence. |
| 287 | Tauri splashscreen loading window | **Base shipped; local follow-up remains** | `44a0b76` is cached; `refactor/issue-287-splashscreen` contains later watcher/reveal hardening and evidence. |
| 288 | Shared-connection transaction model | **Base shipped; local follow-up remains** | `db32cb5` is cached; `refactor/issue-288-tx-model` contains later concurrency/test hardening. |
| 289 | Payment amounts, allocations, and page limits | **Base/equivalent shipped; local follow-up remains** | Related payment merge `004e2e5` is cached; `refactor/issue-289` contains final review/evidence history to compare before declaring done. |
| 294 | Translate web sign-in errors | **Base/equivalent shipped; local follow-up remains** | Related sign-in merge `f65e812` is cached; `refactor/issue-294-signin-translation` contains local tests/evidence. |
| 307 | Type-safe `WorkspaceDomain` invalidation map | **Base shipped; local follow-up remains** | `6481df9` is cached; `refactor/issue-307` contains the reviewed compile-time probe follow-up. |
| 312 | Convert remaining UI px values to rem | **No issue-specific local evidence** | No issue branch/design/review evidence found. Follow-up from #282; scope must be re-audited locally. |
| 183 | Server-side search/filter for cursor lists | **Base/equivalent shipped; local follow-up remains** | Related search merge `37a4de0` is cached; `refactor/issue-183-search-filter` contains additional search/test work. |
| 217 | Deepen dashboard view-model seam | **Implemented and reviewed locally; not shipped in cached `develop`** | Design + review evidence ships with the recovery-line port stack (`.scratch/implementation/217-design.md`, `.scratch/reviews/217/`). |
| 228 | Remove/rename the no-op recovery-key E2E claim | **Implemented and reviewed locally; not shipped** | `refactor/issue-228-recovery-e2e` has the reviewed test rename/documentation fix; no equivalent change is in cached `origin/develop`. |
| 229 | Add `findKeyById` to RecoveryKeyPort | **No issue-specific local evidence** | No issue branch/design/review evidence found. Deferred from #195. |
| 234 | Reject zero-width/format characters in key inputs | **Base shipped; local follow-up remains** | `3c14490` is cached; `refactor/issue-234` contains later contract/wire-test evidence. |
| 252 | 85% coverage for update and small modules | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent: #248. |
| 253 | 85% coverage for inventory | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent: #248. |
| 255 | Replace the narrow API coverage include | **No issue-specific local evidence** | No issue branch/design/review evidence found. Blocked by coverage batches; parent: #248. |
| 256 | Enforce 85% web coverage thresholds | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent: #248. |
| 199 | Remove `rawDatabase` from the router | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent: #191. |
| 213 | Collapse the `CompanyService` facade | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent/map context: #211. |
| 216 | Unify the bootstrap-owner gateway | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent/map context: #211. |
| 237 | One system log and a working audit filter | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent/map context: #235. |
| 240 | Rename the `mock-dashboard` seam | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent/map context: #235. |
| 257 | Debt-ledger failure-mode tests | **No issue-specific local evidence** | No issue branch/design/review evidence found. Parent: #248. |
| 175 | M7 production hardening | **No issue-specific local evidence** | Milestone parent; inspect its plan and child tickets before launching work. |
| 178 | Four missing critical-path E2E specs | **Implemented and reviewed locally; not shipped** | `feature/issue-178-critical-e2e` has completed specs and test/code-review evidence; it is ahead of cached `origin/develop`. |
| 176 | Plan 003 UI polish M1–M10 | **No issue-specific local evidence** | Milestone parent; no issue-specific branch/design/review evidence found. |
| 182 | Provider-neutral persistence ports | **No issue-specific local evidence** | Architecture parent; no issue-specific branch/design/review evidence found. |
| 238 | Composition-root legacy endpoints/residue | **No issue-specific local evidence** | Parent/map context: #235; no issue-specific branch/design/review evidence found. |
| 190 | Persistence Boundary Refactoring specification | **Reference / parent** | Read `docs/specs/persistence-boundary-refactor/SPEC.md`; do not implement this row directly. |
| 191 | Persistence Boundary Refactoring parent | **Reference / parent** | Parent for #199 and related persistence work. |
| 211 | Architecture-review deepenings map | **Reference / parent** | Map for #214, #216, and #217. |
| 235 | Web-layer deepenings map | **Reference / parent** | Map for #237, #238, #240, #241, #242, #243, and #244. |
| 248 | Coverage enforcement/failure-mode parent | **Reference / parent** | Parent for #252, #253, #255, #256, and #257. |

## Recovery order

1. Treat the three **implemented and reviewed locally** rows (#178, #228,
   #232) as the safest local candidates to validate and integrate first.
2. For **base shipped; local follow-up remains**, diff the named branch against
   cached `origin/develop`, run the local gates, and keep only changes that are
   still missing. Do not blindly replay a branch whose base was already merged.
3. Work the **no-evidence** rows only after reading their parent/spec and
   creating a fresh design document.
4. Keep parent/reference rows as navigation; closing a child does not prove the
   parent acceptance criteria are complete.

## Tracked follow-ups (raised by lanes; not part of a merged PR)

| Origin | Item | Ruling |
|--------|------|--------|
| #175 recovery chain (issue-175-migration lane, 2026-08-19) | update_history / update-delivery recovery path (`SqliteUpdateHistoryPort`, `modules/update/*`): partial update application on restart has no recovery hardening/tests, no tracked issue. | **Tracked follow-up** (open); not in MVP gate. Needs a scoped issue + decision to harden+test or explicitly accept as out of scope. |
| #175 recovery chain (issue-175-migration lane, 2026-08-19) | `.agents/skills/cli-review/SKILL.md` unpinned `curl | sh` install. | **Fixed** in a dedicated PR (see open PR); reworded to avoid unpinned remote pipe. |
