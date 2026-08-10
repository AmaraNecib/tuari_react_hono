# Issue #282 — Web hygiene: strip dev livereload from prod HTML, remove 6 dead deps, shadcn→devDeps, fix radix barrel import

**Tier:** STANDARD (web config/component hygiene, no behavior change; no authz/crypto/financial logic)
**Base SHA:** `03ec349643901a2802338d8e19b730b28e5eb841` (merge-base with `origin/develop`)
**Branch:** `refactor/issue-282-web-hygiene` (already checked out, clean tree)

## Problem (from issue #282)

Verified on `develop @ fd94c41`, re-verified on `develop @ 03ec349`:

1. **Dev livereload script ships to production** — `apps/web/index.html:13-15` has
   `<!-- impeccable-live-start --> <script src="http://localhost:8400/live.js"></script>`
   copied verbatim into `dist/index.html`. Every prod page requests localhost:8400
   (and may attempt a WebSocket reconnect loop).
2. **6 dead dependencies** — zero imports anywhere in `apps/web` (re-grepped at
   `03ec349`, excluding `node_modules`/`dist`): `recharts` (5.2 MB), `cmdk`,
   `embla-carousel-react`, `vaul`, `next-themes`, `@tanstack/react-router-devtools`.
   The only remaining references are dead entries in `vite.config.ts` `manualChunks`
   (`cmdk`, `vaul`, `next-themes`) — those are cleaned with the removal.
3. **`shadcn` (CLI) in `dependencies`** — belongs in `devDependencies`
   (`apps/web/package.json:44`). Verified safe: `src/styles.css` imports
   `shadcn/tailwind.css`, which resolves at BUILD time via the package export map
   (`"./tailwind.css"` → `"./dist/tailwind.css"`); CI runs `pnpm install
   --frozen-lockfile` (dev deps installed); no Dockerfiles exist in the repo.
4. **Barrel import defeats tree-shaking** — `components/ui/alert-dialog.tsx:5`
   `import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"`; every
   other UI primitive uses named/subpath imports (`dialog.tsx`:
   `import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"`).

## Decisions

### 1. Strip the impeccable block — remove entirely, no dev guard

Chosen: **delete the block from `index.html`** rather than injecting only in dev.

- Vite already provides HMR in dev (`pnpm dev:web`); the external `live.js`
  reloader is not part of the repo's workflow.
- The `impeccable` tool re-injects its markers when a live-iteration session runs;
  a build-level regression test (below) means CI catches any future re-injection
  instead of silently leaking into prod again.
- Keeps a `localhost:8400` reference out of the repo entirely (no latent footgun).

### 2–3. Remove dead deps / shadcn→devDeps

Use `pnpm --filter @tuari/web remove ...` for the 6 dead deps (updates
`package.json` + `pnpm-lock.yaml` atomically), then move `shadcn` to
`devDependencies` in `package.json` and let `pnpm install` reconcile the lockfile
(specifier unchanged: `^4.0.5`). Clean the now-dead `cmdk`/`vaul`/`next-themes`
entries from `vite.config.ts` `manualChunks`.

### 4. Named radix imports

Convert to named imports aliased to the existing `AlertDialogPrimitive`-style
reference points:

```ts
import {
  Action as AlertDialogActionPrimitive,
  Cancel as AlertDialogCancelPrimitive,
  Content as AlertDialogContentPrimitive,
  Description as AlertDialogDescriptionPrimitive,
  Overlay as AlertDialogOverlayPrimitive,
  Portal as AlertDialogPortalPrimitive,
  Root as AlertDialogRootPrimitive,
  Title as AlertDialogTitlePrimitive,
  Trigger as AlertDialogTriggerPrimitive,
} from "@radix-ui/react-alert-dialog"
```

Every `AlertDialogPrimitive.X` usage becomes `AlertDialogXPrimitive` — mechanical,
no behavior change, tree-shakeable named imports matching the base-ui convention.

## Public API / interfaces

- `apps/web/index.html` — the `impeccable-live-start/end` block deleted.
- `apps/web/package.json` — 6 deps removed from `dependencies`; `shadcn` moved
  `dependencies` → `devDependencies`.
- `apps/web/vite.config.ts` — `manualChunks` drops the `cmdk`/`vaul`/`next-themes`
  branches (dead after removal).
- `apps/web/src/components/ui/alert-dialog.tsx` — namespace import → named imports.
- No runtime API changes; no component behavior changes.

## Dependencies

- None added. Removals: `recharts`, `cmdk`, `embla-carousel-react`, `vaul`,
  `next-themes`, `@tanstack/react-router-devtools`.
- `pnpm-lock.yaml` updated (single `pnpm install` pass).

## Planned tests

Unit (vitest, `apps/web/src/web-hygiene/`):

- `dependencies.test.ts`:
  - `package.json` contains none of the 6 removed packages (deps or devDeps).
  - `shadcn` is in `devDependencies`, not `dependencies`.
  - `vite.config.ts` `manualChunks` references none of the removed packages.
  - `alert-dialog.tsx` has no `import * as ... from "@radix-ui/..."` (named-import
    style pinned; catches a regression back to the barrel).
- `prod-html.test.ts`:
  - `index.html` source contains no `impeccable`/`live.js`/`localhost:8400` markers.
  - **Full `vite build` to a temp dir** → `dist/index.html` contains no
    `impeccable`/`localhost:8400` markers (the literal issue claim: prod HTML
    never ships the dev script). Generous describe timeout (~120 s); the repo
    already accepts heavy tests (api `dependencies.test.ts` at 60 s).

Playwright E2E (`tests/e2e/web-hygiene.spec.ts`):

- Load the app root, register `page.on("request")` BEFORE `goto`, and assert **no
  request to `localhost:8400` / `live.js`** fires during load; also assert
  `page.content()` carries no `impeccable-live` markers. The dev server serves
  `index.html` verbatim, so a re-injected marker is caught behaviorally. Spec is
  read-only (no bootstrap/sign-in clicks) so it cannot disturb the serial E2E
  suite's shared DB state.
- Limitation (documented): E2E runs against the vite dev server, not the prod
  build; the prod-build property is pinned by the `vite build` unit test above.

## Implementation risks

- `vite build` inside vitest: uses the vite JS API with `root` pinned to
  `apps/web`, output to a temp dir; expected ~15–30 s. If it proves environment-
  flaky on Windows, fall back to source-level assertions + E2E and note it.
- `pnpm remove` may hit a pre-existing lockfile state; re-run `pnpm install` if
  needed. The web package keeps its existing deps untouched otherwise.
- The radix re-export names must be re-checked against `@radix-ui/react-alert-dialog`
  v1.1.15 exports (all nine: Root/Trigger/Portal/Overlay/Content/Title/Description/
  Action/Cancel) — verified present in the installed package before editing.
- No parallel sibling edits this run; `apps/web` files are exclusively owned by
  this issue (checked: no other open worktree targets `apps/web` in this session).

## Out of scope / deferred

- Recharts was the only charting lib; no chart feature is being added here.
- `next-themes` removal means the app uses its own theme toggle (existing
  `تبديل المظهر` button); no dark-mode provider is being introduced or removed
  beyond the dead dep.
