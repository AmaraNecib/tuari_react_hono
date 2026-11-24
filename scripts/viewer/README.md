# Local diagnostics viewer

Run from the repository with Node 22 or newer:

```sh
node scripts/tuari-viewer.mjs /path/to/bundle.zip -o /path/to/new/report.html
pnpm tuari-viewer /path/to/logs -o /path/to/new/report.html
```

Open report.html directly. Keep report.js beside it. report-data.json contains the same normalized model for other local tools; the entry HTML includes an inert escaped copy because browsers block file:// JSON fetches. This is the parser/report pipeline for #330, not the dashboard in #331.

Inputs use manifest.json and YYYY-MM-DD folders containing app.log, api.log, desktop.log or numbered chunks such as app.1.log. Manifest metadata is retained as provided. Offsets are preserved, and events sort by instant. Truncated final JSON is warned about; malformed complete records fail. Error IDs are numeric and prefix-agnostic.

Archive input accepts stored or deflated ZIP entries with matching central/local metadata and CRC. Only producer paths are accepted. Encryption, links, ZIP64, descriptors and arbitrary archive directories are rejected. Extraction uses a fresh temporary folder that is removed after parsing. Input limits are 100 MiB total, 8 MiB per chunk, 1 MiB per line, 1024 chunks and 100000 events. Manifest size is capped at 64 KiB. Keep input folders unchanged during parsing; this local tool is not a sandbox for concurrently hostile filesystem mutation.

Output files must not already exist. A failed emission removes only files created by that attempt, leaving pre-existing reports and sidecars intact. Move the conflicting output aside before retrying. Use a separate output directory per report, with one writer. Rollback checks file identity before deletion, but is not a sandbox against hostile concurrent path swaps. No additional packages, network access or running app are required.

Run focused proof with `node --test tests/telemetry-viewer.test.mjs`.

Run the offline browser assertion through the heavy-work queue with `node --test tests/telemetry-viewer.browser.test.mjs`. It uses the existing `@playwright/test` dependency and an isolated temporary browser profile, with no server. Set `VIEWER_BROWSER_EXECUTABLE` to an installed Chrome or Edge executable if bundled Chromium is unavailable. `VIEWER_PLAYWRIGHT_MODULE` can point to another installed workspace's `@playwright/test/index.mjs`; it does not install anything. Set `VIEWER_NATIVE_618_ZIP` to the independently captured six-event native #618 export to include its hash-pinned integration case. Without that private fixture, the native case is explicitly skipped.
