// update-channel-metadata.mjs — CLI tool for generating release channel metadata
// Usage: node scripts/update-channel-metadata.mjs [options]
//
// Generates updates.json with the correct channel metadata structure.
//
// Note: This script is the M6.3 multi-channel metadata manager (issue #137).
// It writes a `channels.{nightly,beta,stable}` document for the update
// provider. The M6.4 build pipeline uses a separate single-channel generator
// at scripts/generate-update-metadata.mjs (added in PR #171). The two scripts
// coexist because they serve distinct stages of the release pipeline.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/update-channel-metadata.mjs [options]

Generate updates.json with release channel metadata.

Options:
  --channel <name>       Channel name: nightly, beta, stable (required)
  --version <ver>        Latest version string for this channel (required)
  --min-version <ver>    Minimum supported version for this channel (required)
  --url <url>            Download URL for the update package (required)
  --release-date <date>  ISO 8601 release date (required)
  --changelog <url>      URL to the changelog for this release (required)
  --output <path>        Output file path for updates.json (required)
  --merge <path>         Path to existing updates.json to merge into (optional)
  --help                 Show this help

Example:
  node scripts/update-channel-metadata.mjs \\
    --channel nightly \\
    --version 0.6.0-nightly.20260708 \\
    --min-version 0.1.0 \\
    --url https://github.com/AmaraNecib/tuari_react_hono/releases/download/nightly/update-0.6.0-nightly.update \\
    --release-date 2026-07-08T00:00:00Z \\
    --changelog https://github.com/AmaraNecib/tuari_react_hono/releases/nightly \\
    --output updates.json
`);
  process.exit(0);
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const channel = getArg('--channel');
const version = getArg('--version');
const minVersion = getArg('--min-version');
const url = getArg('--url');
const releaseDate = getArg('--release-date');
const changelog = getArg('--changelog');
const outputPath = getArg('--output');
const mergePath = getArg('--merge');

// Validate required arguments
const required = [
  ['--channel', channel],
  ['--version', version],
  ['--min-version', minVersion],
  ['--url', url],
  ['--release-date', releaseDate],
  ['--changelog', changelog],
  ['--output', outputPath],
];

for (const [name, value] of required) {
  if (value === undefined || value === '') {
    console.error(`Error: ${name} is required`);
    process.exit(1);
  }
}

// Validate channel name
const validChannels = ['nightly', 'beta', 'stable'];
if (!validChannels.includes(channel)) {
  console.error(`Error: invalid channel "${channel}". Must be one of: ${validChannels.join(', ')}`);
  process.exit(1);
}

async function main() {
  let updatesJson = { channels: {} };

  // If --merge is specified, read existing file
  if (mergePath) {
    try {
      const existingContent = await readFile(resolve(mergePath), 'utf8');
      const parsed = JSON.parse(existingContent);
      if (parsed.channels && typeof parsed.channels === 'object') {
        updatesJson = parsed;
      } else {
        console.error('Error: existing updates.json does not have a "channels" object');
        process.exit(1);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File doesn't exist yet, start fresh (don't exit)
        console.warn(`Warning: --merge file "${mergePath}" not found, creating new updates.json`);
      } else {
        console.error(`Error: cannot read --merge file "${mergePath}": ${err.message}`);
        process.exit(1);
      }
    }
  }

  // Build the channel entry
  updatesJson.channels[channel] = {
    latestVersion: version,
    minSupportedVersion: minVersion,
    updateUrl: url,
    releaseDate,
    changeLog: changelog,
  };

  // Write output
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, JSON.stringify(updatesJson, null, 2) + '\n', 'utf8');

  console.log(`Generated updates.json for channel "${channel}" at ${resolvedOutput}`);
  console.log(`  latestVersion: ${version}`);
  console.log(`  updateUrl: ${url}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
