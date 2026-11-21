# Dialog backdrop rem conversion, partial #312

## Owner decision and preselected eligibility

The owner explicitly approved extending the existing capped trial to small reversible UI-only changes with a fresh combined independent review and appropriate tests. CI acceptance, hosted current-head5/5, independence, finding resolution, escalation and excluded elevated domains are unchanged. This approval follows the parent naming partial312 dialog backdrop conversion and its limits, and the owner replying Yes. This is the prospective fifth real task, not a reset or expanded eight-task cap. Slots1–4 are completed documentation tasks. Partial491 was excluded before outcomes and remains excluded.

The latest explicit owner instruction supersedes earlier factual-docs-only starting scope for this bounded extension. It does not authorize broader layout/behavior changes or money/auth/security/CI risks. Review this decision and eligibility before implementation outcomes. If reviewers find consequences beyond visual backdrop styling, pause the trial selection and escalate to the required lenses; retain slot5 in the count.

## Pinned scope

Worktree D:/worktrees/tuari_react_hono/t3-82ba8730-b15d68d081398c59, base cabe73da7880aaf9b7a5b9865dbe7a4db3daf9b0, branch fix/312-dialog-rem-trial. Complete planned manifest: apps/web/src/components/ui/dialog.tsx, a focused apps/web/src/components/ui/dialog.test.tsx, and this design note. No package, workflow, global agent instruction or dependency edits. No salary558 source changes. Part of312 only, never close its larger acceptance criteria.

Replace only DialogOverlay's arbitrary backdrop-blur-[2px] with a rem value matching2px at the current15px root within0.001px. Keep overlay opacity, layout, portal, focus, dismiss handling and public exports unchanged. At larger root sizes the blur should scale. Do not copy the issue's0.125rem precedent blindly: that equals1.875px at15px. No new utility module or design-system abstraction. Architecture: no seam moved. Vocabulary remains DialogOverlay/Backdrop; this changes one styling token, not a domain contract.

Shared Dialog has broad direct callers, including financial forms, but no form state or event code is changed. This eligibility depends on tests/browser evidence proving the change stays in visual blur alone, and a frozen exact diff limited to that token. Shared-file location does not itself make business calculations changed, nor does small line count waive reachable risk analysis.

## Required proof

Focused actual Dialog render regression, independently specified expected rem conversion, root-size scaling and unchanged modal dismissal behavior. Inspect baseline rendering first. Use existing browser harness with narrowly selected local surface/cases for screenshots at current root and enlarged root, RTL and narrow layout. Run selector before a heavy browser slot. No routine full local suite or build; CI owns those. No dependency additions or preview tools unless requested for browser work.

Mode focused-local / CI-final-enforced, protection must be rechecked before publication/merge. Prior effective ruleset26837184 strictCI acceptance app15368 active/no bypass was verified for predecessor585, not claimed current for this branch. Verification evidence must name exact head, commands, duration, counts and raw logs. All test and visual boundaries remain required. Slot5 cannot claim savings from unknown tokens/cost/time. Source remains unchanged until decision review is returned.

## Eligibility review correction

Independent Luna decision review found the selection eligible, with a requirement to validate test and browser feasibility before implementation. The existing keyboard-shortcuts-provider.test.tsx renders the real shared Dialog and checks labelled modal, closed state, Escape and close-button handling. After restoring already locked dependencies with pnpm install --frozen-lockfile --offline, the actual focused suite passed4/4 on the unmodified base. Initial missing-vitest failure is preserved as an environment failure, not expected red. No package or lockfile changed.

Existing tests/e2e/dialogs-a11y.spec.ts has a real keyboard-shortcuts-help browser case; its KeyboardShortcutsHelp imports the changed shared Dialog. The search dialog uses a separate Backdrop and must not be substituted for this surface. A focused browser probe may render the same real help component through Vite with production CSS, avoiding auth/database setup. That is component-browser proof, not a claimed end-to-end login test. Confirm baseline rendering before changing the blur token. If this adapter cannot execute, pause source implementation rather than substituting screenshots or jsdom CSS claims.

## Implementation and observed proof

The first helper-based browser adapter failed before rendering, so source stayed frozen. Parent isolated the actual exported Dialog with real Vite/Tailwind CSS and a minimal i18n provider. Middleware ordering initially served the app fallback instead of the probe; disabling dependency discovery also broke CommonJS imports. Both adapter failures were diagnosed and preserved. Registering a Vite configureServer probe before fallback and prebundling only actual component dependencies produced valid baseline proof without app/API imports. No product bypass or fabricated stylesheet was used.

Baseline and changed RTL1280px/390px browser runs each exercised15px/30px roots, focused labelled close button and real Escape dismissal. Stable screenshots disable animations only in the evidence adapter. Before blur was2px at both roots. After backdrop-blur-[calc(2rem/15)] computes to2px/4px, respectively. Dialog boxes and backdrop opacity matched baseline exactly in all four configurations. Browser errors were empty. Cropped captures and raw metrics remain ignored under .scratch/reviews/312. This is actual component-browser proof, not login or a full E2E run. Existing selector mapped30 specs because shared Dialog has broad callers; local execution is narrowed to the changed CSS/real shared component, while CI retains mapped scope.

The focused render test failed on the old declaration, then passed after the one-token change. It guards class wiring only, not computed CSS. Existing four help-dialog interaction tests remain and passed. Parent real-browser probe independently verifies the styling contract, not a parsed mirror of the class. Changed-file ESLint passed. Initial web typecheck timed out, then failed due unbuilt contracts declarations; compiling the locked contracts prerequisite resolved this. Subsequent full web tsc --noEmit passed. Focused Vitest5/5 passed across two files. No dependency or lockfile changes. No local production app build/full application suite.

Wisdom: dialog draft-identity and financial-transaction lessons do not apply to this styling-only delta; no state or mutation logic changed. Domain vocabulary and architecture remain unchanged. Parent/reviewer elapsed and tool logs are available, model tokens and currency unknown. Browser adapter setup cost is part of this task, not hidden or presented as a review saving. Final frozen-head combined review and exact-head proof still required.
