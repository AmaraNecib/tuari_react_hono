# Currency placement browser proof

Run through `heavy_run`. This is a bounded actual-component fixture, not the
full application E2E suite or authenticated API/database proof.

## Setup

1. Install the repository's pinned dependencies with `pnpm install --frozen-lockfile`.
2. Compile `@tuari/contracts` through the heavy queue if its generated entry is absent.
3. Use the installed Playwright Chromium. If the browser binary is absent, follow the repository's existing browser setup; this script does not fetch packages or browsers.
4. For before/after proof, the local Git object database must contain baseline commit `7a56b245740d6d2ef836181cd150011657be0303`. A shallow checkout can fetch that exact published commit with `git fetch origin 7a56b245740d6d2ef836181cd150011657be0303`.

No ignored setup files are required. Before/after mode creates a fresh baseline
archive under `.scratch/reviews/535/baselines/` from that commit. It creates its
own parent directories and dependency junctions without replacing existing
files. After-only mode never creates or reads a baseline archive or junction.
Each output directory must be new; existing output is refused.

## Commands

From the repository root in Windows cmd, through the heavy queue:

```cmd
set CURRENCY_OUTPUT=.scratch/reviews/535/browser-unique-run&& node tests/currency-placement/run.mjs
```

After-only mode works without the baseline commit:

```cmd
set CURRENCY_OUTPUT=.scratch/reviews/535/after-unique-run&& set CURRENCY_AFTER_ONLY=1&& node tests/currency-placement/run.mjs
```

Use a fresh shell or clear `CURRENCY_AFTER_ONLY` before a later before/after
run. `CURRENCY_BASELINE_ONLY=1` selects only the pinned before source.

## Scope and outputs

The fixture uses actual `MainContent` with the signed-in shell's `px-10 py-8`
classes, actual affected display components, styles and Arabic translations.
Queries, navigation and presentation data are synthetic. Desktop 1280px and
mobile 390px/360px render in RTL and LTR. Source is frozen during execution.

`geometry.json` records source HEAD/tree/status, baseline source, timing, exact
numeric values and geometry. Assertions cover currency-left, independent sign
position, numeric clipping, project contribution-row fit inside the real shell
width and audit prose spacing in normal inline flow. Native element and context
PNG crops and invoice Pay Full interaction recordings stay in the output path.
Logs/reports/recordings remain private; publish only approved synthetic images.
