# Theme / contrast fixes (lane `fix-theme-contrast`)

**Tier:** Standard
**Mode:** local-only (lane; parent owns push/PR, no hosted review)
**Branch:** `fix/theme-contrast` in `worktrees/fix-theme-contrast`
**Base ref:** `origin/develop` = `fdb5dda66b21aa3ca09b5e6a04b4899dcc75fd36`
**Branch point (pre-rebase):** `22495413b7d792e20afcce24a94d6c84c61dd523`
**Owner items:** 2 (select/dropdown + dark-mode selection contrast), 3 (date-picker
arrows), 9 (expenses header alignment).

## Problem (owner, from using the app)

- Dark mode: selecting ordinary text (and text inside inputs) makes the text
  invisible.
- Dark mode: the month arrows in the date picker are invisible; light mode is
  fine because they are black on white.
- A highlighted/selected dropdown option is hard to read in dark mode, and the
  native dropdown background looks wrong.
- The expenses page header sits lower than the headers on other pages.

The parent confirmed two root causes: the `::selection` rule mixed the brand
accent with an **unconditional white**, and `chevron: ""` left react-day-picker's
**default black fill**. Light mode is the reference — the fix must not change its
look.

## Root causes and fixes

### 1. `::selection` (item 2) — `apps/web/src/styles.css`

```css
/* before */
::selection { background: color-mix(in oklab, var(--primary) 24%, white); color: var(--foreground); }
/* after */
::selection { background: color-mix(in oklab, var(--primary) 24%, var(--surface)); color: var(--foreground); }
```

`white` is light in both themes, so in dark mode the highlight sat under the
light `--foreground` ink and the text vanished. `--surface` is `#ffffff` in light
and `#1f1c18` in dark, so **light mode is byte-identical** (same 24% mix over
white) while dark mode gets a dark highlight that `--foreground` stays readable
on. Token used: `--surface` (+ existing `--primary`, `--foreground`).

Search of the stylesheet for the same white-mix mistake: the only other literal
`white` is `@media print { body { background: white; color: black } }`, which is
intentional print styling, not a theme mix. No other `color-mix(... white)`
exists.

### 2. Native `<select>` dropdown (item 2) — `apps/web/src/styles.css`

```css
/* before */
select, select option { color: var(--foreground); background-color: var(--background); }
.dark select { color-scheme: dark; }
/* after */
select { color: var(--foreground); background-color: var(--background); color-scheme: light; }
.dark select { color-scheme: dark; }
```

Setting `color`/`background-color` on `<option>` overrides the OS highlight's own
text colour, so in dark mode a hovered option rendered light ink on the (light)
system highlight — the owner's "dropdown background does not look right". The
supported way to theme the native popup is `color-scheme`; the control itself
keeps the theme tokens through `formControlClassName`. Light mode keeps a light
`color-scheme`, dark mode pins `dark`.

### 3. Shared Base UI `Select` (item 2) — `apps/web/src/components/ui/select.tsx`

- Popup surface switched from `bg-card text-card-foreground` to the semantic
  `bg-popover text-popover-foreground` (both resolve to `--surface`/`--ink`, so
  no visual change; the scroll arrows match with `bg-popover`).
- Item states switched from the `:focus` variant to Base UI's real state
  attributes: `data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground`
  and `data-[selected]:font-medium`. Base UI marks hover/keyboard navigation with
  `data-highlighted` (value `""`) and the chosen row with `data-selected` — the
  repo's `shadcn/tailwind.css` defines `data-selected` as `[data-selected="true"]`,
  which Base UI never sets, so the arbitrary `data-[selected]:` form is required.
  Light mode keeps the paired `--accent-foreground` text exactly as before; a
  dark-only `dark:data-[highlighted]:text-foreground` strengthens the dark
  highlight text to the full `--foreground` ink on the dark `--accent-soft`
  surface (measured 12.8:1 vs the previous 8.6:1 — that pair already cleared AA,
  so this is polish, not a fix). Base UI 1.7.0 emits `data-highlighted=""` and
  `data-selected=""` (bare attributes, verified against `node_modules` and
  asserted in the jsdom test).

### 4. Input placeholders (item 2) — `apps/web/src/components/ui/form-controls.tsx`

Added `dark:placeholder:text-muted-foreground` alongside the existing
`placeholder:text-muted-foreground/80`. The dark `/80` composite over the dark
input surface measures ~5.0:1; the full token measures ~7.2:1, so the override
buys headroom above AA. Light `/80` stays untouched at ~4.3:1 — the owner's
reference theme. The pair is now one exported `placeholderContrastClassName`,
used by `formControlClassName`, the `CurrencyInput` inner input and the bespoke
`employee-batch-row-card.tsx` textarea, so the token is defined once. Input text
was already `--foreground` (≈15:1 in dark) and is unchanged.

### 5. Date-picker arrows (item 3) — `apps/web/src/components/ui/date-picker.tsx`

`chevron: "size-4 fill-current"`. react-day-picker's default chevron is a
`<polygon>` with no `fill` (SVG initial fill = black), so it was black in both
themes; `fill-current` makes it inherit the button's `text-ink-3`
(`#595959` light / `#a8a298` dark, ~6.7:1 on the dark popover). The nav buttons
also gained `focus-visible:outline-*` and `aria-disabled:cursor-not-allowed
aria-disabled:opacity-40 aria-disabled:hover:*`. react-day-picker marks an
unavailable month with `aria-disabled` and `tabIndex={-1}`, never the native
`disabled` attribute, so these must be `aria-disabled:` variants — the earlier
`disabled:` classes were dead CSS. This DatePicker passes no `fromDate`/`toDate`,
so the disabled state is currently unreachable here; the variants match the
library contract if a range limit is ever added.

### 6. Expenses header alignment (item 9) — `apps/web/src/features/expenses/expenses-page.tsx`

The page wrapped everything in `PageSurfaceContent` (`space-y-6 p-6 xl:p-7`),
adding 24–28px of top padding under the shell's `py-8`. The expenses root now
renders through `RecordPageFrame`, the same component the employees list uses
(its root is a bare `space-y-6`), so the frame is shared rather than copied. The
inventory pages add `p-6` inside their own panel, so employees is the reference
used.

## Tests

- `apps/web/src/components/ui/createable-select.test.tsx` — popup uses
  `bg-popover`/`text-popover-foreground`; item carries
  `data-[highlighted]:bg-accent`, `data-[highlighted]:text-accent-foreground`,
  `dark:data-[highlighted]:text-foreground`, `data-[selected]:font-medium`; the
  rendered option really carries `data-highlighted`/`data-selected` and keyboard
  navigation moves the highlight; the trigger's dark placeholder override is
  pinned by exact token.
- `apps/web/src/components/ui/date-picker.test.tsx` — every nav chevron has
  `fill-current`; both nav buttons carry `text-ink-3`, `hover:text-ink`, the four
  `aria-disabled:*` states and `focus-visible:outline-*`, and no `disabled:`
  token.
- `apps/web/src/components/ui/form-controls.test.tsx` (new) — Input, Textarea,
  CurrencyInput carry `dark:placeholder:text-muted-foreground` (exact-token, so
  the `/80` substring cannot satisfy it); NativeSelect keeps the shared control
  class.
- `apps/web/src/features/employees/employee-batch-row-card.test.tsx` (new) —
  bespoke notes textarea carries the same dark placeholder token.
- `apps/web/src/features/expenses/expenses-page.test.tsx` — page root is
  `space-y-6` with no `p-6`/`xl:p-7`.
- `apps/web/src/web-hygiene/theme-contrast.test.ts` (new) — reads `styles.css`
  and pins the `::selection` surface mix, the per-theme `color-scheme` on
  `select`, the absence of a `select option` override, and the single definition
  of the placeholder token pair. No jsdom test can evaluate those rules.

Assertions target class/token names, not colour literals. Each production change
was reverted to the base SHA and the matching test was confirmed to fail.

## Visual check (manual)

Rendered the real `Select`, `NativeSelect`, `DatePicker`, `Input` and `Textarea`
from `styles.css` in a throwaway Vite harness (deleted after use) and inspected
light + dark:
- light highlighted option text measured `rgb(64,64,64)` (unchanged); dark
  measured `rgb(240,235,224)` on `#2e2418`;
- dark selection highlight is a dark terracotta tint with light text (readable);
- date-picker arrows are light grey in dark, dark grey in light;
- dark select popup: `#1f1c18` surface, selected row `#2e2418` with `#f0ebe0`
  text (≈9:1);
- native `<option>` no longer forces a light colour in dark mode.

Screenshots: `D:/projects/tuari_react_hono/tmp/{dark-open-after,selection-dark-after,datepicker-dark-after2,datepicker-light-after}.png`.

## Verification

The lane branch was created at `22495413`; `origin/develop` had since moved one
commit ahead (`fdb5dda6`, "develop is red — the transfer dialog test needs the
new charge-default query stubbed (#441)"), which is exactly the
`date-picker-screens.test.tsx` failure seen before the rebase. `git rebase
origin/develop` was replayed cleanly, contracts `dist` was rebuilt, and all
checks re-run on the rebased head.

- `pnpm --filter @tuari/web test --maxWorkers=2` → **732 passed / 732** (85 files).
- `pnpm typecheck` → 4/4 tasks successful.
- `pnpm lint` → web `eslint .` clean, `check:unslop` PASS.
- Scoped coverage (`vitest run --coverage` over the touched tests): `select.tsx`
  70% stmts / 83% branch, `date-picker.tsx` 95% / 85%, `form-controls.tsx`
  55% / 20%, `expenses-page.tsx` 72% / 63%, `employee-batch-row-card.tsx`
  27% / 47%. No web coverage threshold is configured.
- Greptile CLI could not run in this environment (`greptile whoami` →
  `error: refresh failed: access_denied`); the lane brief also forbids a hosted
  review. The parent owns the review gate.

## Risks / constraints

- `--surface` in `::selection` assumes selection sits on a theme surface; on a
  card it is exact, over `--bg` it is within one neutral step. Acceptable.
- `data-[selected]:font-medium` adds a font-weight change on the selected row;
  no layout shift was observed (the popup width is anchored).
- Removing the `<option>` override leaves the native popup fully to the
  platform, which is the point; the closed control still uses the theme tokens.
- Standard-tier test-audit/code-review evidence was not produced: the lane brief
  scoped verification to the listed local commands and the parent owns the
  review gate.
