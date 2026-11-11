# Issue 540: remove orphan onboarding analytics

## Authority and revision

Owner authorized implementation of issue 540, superseding its tracking-only wording. The issue body and all comments were read through GitHub. There were no comments at inspection.

Assigned tree: `D:/worktrees/tuari_react_hono/fix-issue-540-orphan-an-9f4946372461d47e`.
Branch: `fix/issue-540-orphan-analytics`.
Base: `dd855d7ce183b30de98aa27df1d48f70b0ff51fc`, verified against freshly fetched `origin/develop`. Initial status was clean.

Verification mode: focused-local / CI-final-enforced. The checked-in activation document is historical and still says pending. Current effective develop rules come from active ruleset 26837184, with strict `CI acceptance` from GitHub Actions app 15368, PR thread resolution, deletion/force-push restrictions, no bypass actors and `current_user_can_bypass: never`. Classic branch protection returns 404, so it is not the effective enforcement mechanism. Recheck effective rules and current-head CI separately before reporting hosted readiness. Owner merges manually.

Review tier: Standard. The reachable risk is accidentally removing local onboarding progress or its tour. Deleted schema declarations are unreachable, not migrations. No auth, finance, telemetry programme or data behavior changes are intended. Three distinct initial Luna review sessions remain required, followed by a bounded combined-delta review if needed.

## Caller and entrypoint inventory

| Path or interface | Observed source facts | Decision |
| --- | --- | --- |
| `api/src/schema/analytics.ts` | Only the orphan service imports it. Defines `analytics_event`, `onboarding_progress`, and `user_onboarding_level`. No active initializer imports it. | Delete definitions only. Do not inspect, drop or modify any persisted database or table. |
| `api/src/modules/analytics/analytics.service.ts` | Only the orphan routes import its type. Its `../../infrastructure/database/drizzle` import targets a missing root-api file. No constructor caller outside these files. | Delete. Do not relocate into apps/api. |
| `api/src/modules/analytics/analytics.routes.ts` | `createAnalyticsRoutes` has no external caller. Contains track, events, count, progress, level and stats routes but no server mount. Root api contains only these three files. | Delete. Do not activate endpoints. |
| `apps/web/src/lib/analytics-db.ts` | Only `use-analytics.ts` imports it. Event functions would create a session ID and POST `/api/analytics/track`; query functions would GET events/count. Definitions do not send requests on import. | Delete unused client, including session-ID creation code. Do not clear existing session storage. |
| `apps/web/src/hooks/use-analytics.ts` | Exports `useAnalytics`, `useTourAnalytics`, `useTutorialAnalytics`. Repository-wide imports, export names, event names and endpoint searches find no consumers outside these two client files. No barrel or dynamic loader references them. | Delete unused hooks. Their internal UI-like state has no callers. |
| `apps/web/vite.config.ts` | Only the unused analytics client reads injected `VITE_API_PORT`; no other consumer was found. | Remove that define and its local variable/import. Keep all server, preview, font and chunk configuration. |
| `apps/web/src/lib/ports.ts` | Shared loopback URL/port logic serves Vite, Playwright and E2E. One comment advertises the deleted client. | Correct that comment only; preserve shared port interfaces and behavior. |
| `apps/web/src/hooks/use-user-journey.tsx` | Separate live module. `HomeViewSignedInShell` imports `UserJourneyTour` with `home-tour` and autoStart. `home-view.tsx` renders that shell. Hook persists status, step and level in localStorage and never imports analytics. | Preserve source and app composition unchanged. Add local-persistence and no-network regression proof to its existing tests. |
| `components/ui/{guided-tour,interactive-tutorial,progressive-onboarding,progress-tracking,onboarding-tooltip}.tsx` | Independent UI definitions, not consumers of the removed hooks or client. Some have no external caller today. Progressive onboarding shares the local `user-onboarding-level` key with UserJourney. | Preserve all. Lack of current consumers does not authorize unrelated onboarding cleanup. |
| Active server and schema | `apps/api/src/index.ts` creates dependencies and app. `app/dependencies.ts` calls `ensureDatabaseSchema` and creates domain services. `app/create-app.ts` mounts auth, updates, inventory and RPC, ending in a 404 handler. `infrastructure/database/drizzle.ts` imports active `../../schema`; schema initialization uses its own schema-definitions. No analytics identifiers, table names or route composition in active API/contracts. | No active API, schema, migration, contracts or app-shell edits. |
| Build/test wiring | `pnpm-workspace.yaml` includes apps/* and packages/*, not api/. API tsconfig includes its own src/**/*.ts. Turbo uses workspace tasks. CI lint explicitly runs repo hygiene, and web CI runs Vitest. | Put deletion/request/import guard in existing repo hygiene and retained behavior in existing web test. No CI edits. |
| Documentation | Historical reporting/design documents mention financial analytics or future usage analytics. Licensing docs place telemetry in v2. None wires the orphan server/client. | Preserve historical docs and separate telemetry/reporting scope. |

Search covered the repository, then apps, packages, scripts and tests for imports, exported hook/factory names, event calls, table identifiers and endpoint strings. Reachability was traced from live HomeView composition, not inferred from the root API directory alone.

## Observed versus inferred behavior

Observed: the orphan files and missing dependencies exist in source; live composition does not reference them; UserJourney tests exercise local UI and storage. No production browser/network session was observed. These findings do not establish a production traffic count or prove historical databases never contained these tables.

Inference: the current checked-in app cannot issue requests through these unused hooks because there are no import/call paths. If someone imported them later, they would target nonexistent analytics endpoints and could log errors or silently discard events. Removing the definitions prevents that accidental integration. This change does not fix an observed live onboarding failure and does not disable known active collection.

No product/privacy decision is required for deleting unreachable collection definitions. Any future collection, retention or integration requires a separate owner decision. Existing tables, backups, keys, source outside the named scope and persisted user preferences remain untouched.

## Domain model and architecture

An onboarding journey is user-facing local progress, with status, step and experience level. An analytics event is a proposed server-side usage record with event payload, timestamp, session and optional user. These concepts are not interchangeable. `user-onboarding-level` in localStorage is not the unused `user_onboarding_level` table.

UserJourney is the retained module and its hook/tour are the public interface. Its storage adapter stays private. The deleted client and hooks add no leverage to callers because none exist. Their deletion makes complexity disappear rather than spreading it across callers. No replacement adapter, abstraction or stub is needed. The only removed configuration seam is the unused VITE_API_PORT define. Shared loopback port helpers remain intact. No glossary change or hard-to-reverse architectural decision is needed for this bounded removal.

## Proof plan and boundaries

Use the owner-requested seams: source/import/request absence and retained reachable onboarding paths. A source guard is appropriate for dead-file deletion, but is not runtime network proof. Two new repo-hygiene cases must fail before removal: the five obsolete paths must be absent, and web source must contain no stale endpoint or deleted-module references. CI already runs this file.

Extend the real UserJourney hook/tour tests with a fetch boundary spy, local status/step/level persistence across remount, and absence of analytics session creation. Existing rendered-tour cases retain next, skip, Escape, completion and empty-step behavior. These component tests are synthetic execution of the real module, not a live-browser claim. No user-visible UI change or screenshot is needed.

Run affected repo hygiene, UserJourney tests, ports tests if available, relevant ESLint, web typecheck, diff checks and unslop. Contracts declarations may need compilation for web typecheck, not an application build. Full suites/builds/browser are CI-final. Preserve expected-red failures, native exit codes, durations and logs privately under `.scratch/reviews/540` and anchor final verification to the committed SHA.

## Applied wisdom

Applied `advertised-but-unimplemented-contract-surface-drop-the-procedures-don-t-stub-handlers`: remove orphan interfaces instead of creating fake success responses. Its retained-schema advice concerns reusable domain vocabulary; these isolated storage declarations are not shared domain types.

Read `e2e-bootstrap-helper-was-broken-substring-label-match-onboarding-tour`. It confirms the live journey storage keys. Its browser bootstrap advice is not activated here because no browser run or UI change is needed.

No recurring lesson or agent-policy edit is introduced.
