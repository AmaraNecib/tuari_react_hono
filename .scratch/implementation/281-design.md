# Issue #281 — Web perf: self-host fonts, drop Google Fonts, preload Arabic woff2

**Tier:** Standard (UI / build config)
**Base:** `origin/develop` @ `03ec349` (branch `refactor/issue-281-fonts` already at base)

## Problem (re-verified)

`apps/web` downloads BOTH font stacks:

1. `apps/web/index.html` loads **6 Google Fonts families** (Instrument Serif, Inter
   Tight, JetBrains Mono, IBM Plex Sans Arabic, Noto Naskh Arabic, Amiri) via a
   **render-blocking** `fonts.googleapis.com` CSS request + 2 preconnects — a
   third-party round trip on every load.
2. `apps/web/src/styles.css:4` `@import "@fontsource-variable/noto-sans-arabic"`
   bundles **5 woff2 files (~252 KB)** (arabic 162 KB, latin 30 KB, latin-ext 16 KB,
   math 22 KB, symbols 14 KB) — the fallback Arabic sans.
3. No `<link rel="preload">` for the Arabic woff2 → font-swap delay on first text paint.

All 6 families are genuinely used (verified by grep): Instrument Serif (`font-display`,
7 uses + 4 italic uses), Inter Tight (Latin body), JetBrains Mono (`font-mono`, 38 uses),
IBM Plex Sans Arabic (Arabic body via `--font-arabic`), Amiri (Arabic headings,
`html[lang="ar"] .font-display`), Noto Naskh Arabic (Arabic serif fallback).

## Decision

**Self-host all 6 families via @fontsource, drop the Google `<link>` + preconnects
entirely, and preload the primary Arabic body woff2.** Keep the bundled
Noto Sans Arabic Variable as the Arabic-sans fallback. This preserves the exact
typography (option 1 of the issue) while removing the render-blocking third-party
request and all third-party font fetches.

### Subset/axis/weight trimming (per user request: compact files, no data loss)

Browsers only download what CSS `unicode-range` matches, but the *dist* package
carries every emitted woff2. Trim unused subsets/axes/weights so the deployable
bundle stays small without changing what renders (app is Arabic + French/Algerian
Latin only):

| Family | Role | Kept files | Dropped (savings) |
|---|---|---|---|
| Inter Tight Variable | Latin body sans | latin-wght (43 KB) + latin-ext-wght (87 KB) — hand `@font-face` | cyrillic(-ext), greek(-ext), vietnamese (~300 KB) |
| JetBrains Mono Variable | mono | latin-wght (39 KB) + latin-ext-wght (14 KB) — hand `@font-face` | cyrillic(-ext), greek, vietnamese (~150 KB) |
| Instrument Serif | Latin display serif | latin/latin-ext × 400 normal + 400 italic (4 files, ~80 KB) | nothing (italic is used in 4 components) |
| IBM Plex Sans Arabic | Arabic body sans | arabic + latin × 400/500/600/700 (8 files) | cyrillic-ext, latin-ext, weights 100–300 |
| Amiri | Arabic display serif | arabic-400 (106 KB) + arabic-700 (97 KB) + latin-400 (19 KB) | italic (CSS forces `font-style: normal`), latin-ext, latin-700 |
| Noto Naskh Arabic | Arabic serif fallback | arabic-400 + arabic-700 (2 files) | latin, math, symbols, latin-ext subsets |
| Noto Sans Arabic Variable | Arabic sans fallback | arabic-wght (162 KB) — hand `@font-face` | latin, latin-ext, math, symbols subsets + wdth/standard axes (~90 KB) |

Static packages import their per-subset CSS files (e.g.
`@import "@fontsource/ibm-plex-sans-arabic/arabic-400.css"`) — declarative, no hand
rules. Variable packages ship only all-subset CSS, so their kept subsets are declared
as hand-written `@font-face` blocks with `url("@fontsource-variable/...")` bare
specifiers — **verified working** in a probe build (vite resolves + hashes them, and
dedupes identical files against the JS preload import).

### Family-name updates (fontsource registers variable families as `<Name> Variable`)

- `--font-body` / `--font-sans`: `"Inter Tight"` → `"Inter Tight Variable"`
- `--font-mono`: `"JetBrains Mono"` → `"JetBrains Mono Variable"`
- Other family names already match (`Instrument Serif`, `IBM Plex Sans Arabic`,
  `Amiri`, `Noto Naskh Arabic`, `Noto Sans Arabic Variable`).
- Only `styles.css` references these names (grep-verified; tsx uses tailwind utilities).

### Preload

Preload **IBM Plex Sans Arabic arabic-400-normal.woff2** — the font that actually
renders first-paint Arabic body text (the issue's "Arabic woff2"). Implemented as a
**build-time HTML injection** (`preloadArabicFont` plugin in `vite.config.ts`):
`transformIndexHtml` resolves the emitted hashed woff2 from the build bundle and
injects `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous">`
into the served `index.html` **before any JS executes** — discoverable by the
browser's HTML preload scanner, so the font fetch starts in parallel with the
bundle/CSS download. The injected URL is the same hashed asset the CSS
`@font-face` uses (same content → same asset), so the preloaded resource is the
one fetched.

> **Why not runtime injection (initial approach, rejected by Greptile):**
> `preloadFonts()` in `main.tsx` (a JS module importing the woff2 URL) appended
> the link only AFTER the entry bundle downloaded and evaluated — the HTML
> scanner never sees it, so on cold loads the font fetch starts late and the
> intended first-paint benefit is largely lost. Dev servers do not run the
> build transform (no preload link in dev — acceptable; dev is not the
> perf-critical path).

## Public surface / files touched

- `apps/web/package.json` — add 6 `@fontsource*` deps (inter-tight, jetbrains-mono
  variable; instrument-serif, ibm-plex-sans-arabic, amiri, noto-naskh-arabic static)
- `apps/web/index.html` — remove 2 preconnects + Google Fonts stylesheet link
- `apps/web/src/styles.css` — replace noto-sans-arabic `@import` with subset-limited
  imports + hand `@font-face`; update Inter Tight/JetBrains Mono family names
- `apps/web/vite.config.ts` — inline `preloadArabicFont` plugin (build-only HTML
  preload injection)
- `apps/web/src/fonts.ts` — deleted (runtime injection replaced by build-time link)
- `apps/web/src/main.tsx` — no font import needed
- `apps/web/src/web-hygiene/prod-html.test.ts` — pin: dist/index.html carries the
  static preload link whose URL matches a woff2 in the built CSS
- `tests/web-hygiene.test.mjs` — pin: no googleapis/gstatic/preconnect in index.html,
  no google `@import` in styles.css, all 7 families declared
- `tests/e2e/fonts.spec.ts` (new) — E2E: zero googleapis/gstatic network requests,
  `document.fonts.check()` true for IBM Plex Sans Arabic + Inter Tight Variable

## Tests

- **Unit (node hygiene seam):** extend `tests/web-hygiene.test.mjs` (already wired
  into root `lint` + `test`). Static regression pins so Google fonts can't silently
  return.
- **Build-output (vitest, node env):** `apps/web/src/web-hygiene/prod-html.test.ts`
  runs a real `vite build` and asserts `dist/index.html` contains the static
  preload link (`as="font"`, crossorigin anonymous, href ends `.woff2`) whose URL
  matches a woff2 referenced by the built CSS `@font-face` (same hashed file).
- **E2E (Playwright):** `tests/e2e/fonts.spec.ts` — boots the shell (login page,
  no auth needed), asserts no request hits `fonts.googleapis.com` / `fonts.gstatic.com`
  and no cross-origin font fetch, all 7 families are registered in `document.fonts`,
  and the genuinely-rendered Arabic body font (`IBM Plex Sans Arabic`) reaches
  status `loaded` from self-hosted files. The preload link itself is NOT asserted
  here (dev server has no build transform) — it is covered by the build-output test.
- Run `pnpm typecheck && pnpm test:web && pnpm test:api` + `pnpm lint` +
  `pnpm --filter @tuari/web build` (vite build asserts asset emission).

## Public surface / files touched

- `apps/web/package.json` — add 6 `@fontsource*` deps (inter-tight, jetbrains-mono
  variable; instrument-serif, ibm-plex-sans-arabic, amiri, noto-naskh-arabic static)
- `apps/web/index.html` — remove 2 preconnects + Google Fonts stylesheet link
- `apps/web/src/styles.css` — replace noto-sans-arabic `@import` with subset-limited
  imports + hand `@font-face`; update Inter Tight/JetBrains Mono family names
- `apps/web/src/fonts.ts` (new) — preload link injection, imported by `main.tsx`
- `apps/web/src/main.tsx` — import `./fonts`
- `tests/web-hygiene.test.mjs` — pin: no googleapis/gstatic/preconnect in index.html,
  no google `@import` in styles.css, all 7 families declared
- `tests/e2e/fonts.spec.ts` (new) — E2E: zero googleapis/gstatic network requests,
  preload link present, `document.fonts.check()` true for IBM Plex Sans Arabic +
  Inter Tight Variable

## Tests

- **Unit (node hygiene seam):** extend `tests/web-hygiene.test.mjs` (already wired
  into root `lint` + `test`). Static regression pins so Google fonts can't silently
  return.
- **E2E (Playwright):** `tests/e2e/fonts.spec.ts` — boots the shell (login page,
  no auth needed), asserts no request hits `fonts.googleapis.com` / `fonts.gstatic.com`
  and no cross-origin font fetch, all 7 families are registered in `document.fonts`, and the genuinely-rendered Arabic
  body font (`IBM Plex Sans Arabic`) reaches status `loaded` from self-hosted files.
  The preload link itself is NOT asserted here (dev server has no build transform) —
  covered by the build-output test above.
- Run `pnpm typecheck && pnpm test:web && pnpm test:api` + `pnpm lint` +
  `pnpm --filter @tuari/web build` (vite build asserts asset emission).

## Risks

- **Family-name change** is the only behavioral rename; grep confirms a single file.
- **Trimmed subsets** change nothing for Arabic/Latin text; the only theoretical gap
  (Latin run-ins inside Arabic serif headings) is covered by keeping Amiri latin-400.
- **Preload href in dev** may differ in URL form from the CSS fetch (`/@fs/...`) but
  points at the same bytes; production hashes are identical. E2E asserts behavior,
  not exact dev URLs.
- Vite bare-`url()` resolution verified by probe build before committing to it.
- `impeccable-live` script block in index.html is committed dev tooling (localhost:
  8400) — out of scope, left untouched.
