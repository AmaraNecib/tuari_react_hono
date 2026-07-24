# M6.3 — Release Channel Management

## Public API

### `scripts/update-channel-metadata.mjs`

> **Note:** Originally specified as `scripts/generate-update-metadata.mjs` in
> issue #137. Renamed to avoid a filename conflict with the M6.4 build
> pipeline (PR #171) which uses that name for a single-channel generator.

```bash
node scripts/update-channel-metadata.mjs \
  --channel nightly \
  --version 0.6.0-nightly.20260708 \
  --min-version 0.1.0 \
  --url https://github.com/AmaraNecib/tuari_react_hono/releases/nightly/download/update-0.6.0-nightly.update \
  --release-date 2026-07-08T00:00:00Z \
  --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/nightly \
  --output updates.json
```

Options:
- `--channel` (required): Channel name (nightly, beta, stable)
- `--version` (required): Latest version string for this channel
- `--min-version` (required): Minimum supported version for this channel
- `--url` (required): Download URL for the update package
- `--release-date` (required): ISO 8601 release date
- `--changelog` (required): URL to changelog for this release
- `--output` (required): Output file path for `updates.json`
- `--merge` (optional): Path to existing `updates.json` to merge into (add or update the channel entry)
- `--help`: Show usage

### Output Format

```json
{
  "channels": {
    "nightly": {
      "latestVersion": "0.6.0-nightly.20260708",
      "minSupportedVersion": "0.1.0",
      "updateUrl": "https://github.com/AmaraNecib/tuari_react_hono/releases/nightly/download/update-0.6.0-nightly.update",
      "releaseDate": "2026-07-08T00:00:00Z",
      "changeLog": "https://github.com/AmaraNecib/tuari_react_hono/releases/nightly"
    }
  }
}
```

When `--merge` points to an existing file, the channel entry is added/updated without affecting other channels.

## Internal Dependencies

The script uses only Node.js built-in modules:
- `node:fs/promises` for file I/O
- `node:path` for path resolution

No npm dependencies required.

## Planned Tests

| Test | Type | Tool |
|------|------|------|
| Generated `updates.json` for nightly is valid JSON with correct fields | Unit | Node test |
| Generated `updates.json` for stable points to stable download URL | Unit | Node test |
| Channel promotion script updates channel entry without re-signing | Integration | Shell |
| `--merge` preserves existing channels and updates target | Unit | Node test |
| Missing required args exits with non-zero | Unit | Node test |

## Implementation Risks

- The `--merge` feature must correctly parse existing `updates.json`, update/add one channel, and write back without corrupting other channels.
- File locking: if two builds write to the same `updates.json` concurrently, last write wins. This is acceptable for now since CI runs are sequential per channel.

## Channel Promotion

Channel promotion works by:
1. The same update package binary is uploaded to the target channel's release
2. A new `updates.json` is generated pointing to the new URL
3. No re-signing of the update package is required because signatures are verified against a set of trusted public keys valid across all channels

The promotion flow:
```
nightly build
  → promoted to beta: upload same .update file to beta release, generate updates.json with beta URL
  → promoted to stable: upload same .update file to stable release, generate updates.json with stable URL
```
