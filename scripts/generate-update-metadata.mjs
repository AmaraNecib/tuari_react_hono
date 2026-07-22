// generate-update-metadata.mjs — Generate updates.json for the update provider
// Usage: node scripts/generate-update-metadata.mjs --version <ver> --channel <ch> --build-number <num> --min-supported-version <ver> --update-package <path> --output-dir <dir>
//
// Outputs updates.json — the metadata served by the update provider telling
// clients what update is available.

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── CLI (only runs when executed directly) ─────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].replace(/\\/g, '/').endsWith('generate-update-metadata.mjs')
);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/generate-update-metadata.mjs [options]

Generate updates.json — update metadata for the update provider.

Options:
  --version <ver>              Package version (semver, required)
  --channel <name>             Release channel (stable/beta/nightly, required)
  --build-number <num>         CI build number (required)
  --min-supported-version <ver> Minimum app version that can apply this update (required)
  --update-package <path>      Path to the .update package file (required)
  --download-url <url>         Download URL template or path (optional)
  --output-dir <dir>           Output directory for updates.json (required)
  --help                       Show this help
`);
    process.exit(0);
  }

  function getArg(name) {
    const idx = args.indexOf(name);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    return args[idx + 1];
  }

  const version = getArg('--version');
  const channel = getArg('--channel');
  const buildNumber = getArg('--build-number');
  const minSupportedVersion = getArg('--min-supported-version');
  const updatePackagePath = getArg('--update-package');
  const downloadUrl = getArg('--download-url');
  const outputDir = getArg('--output-dir');

  if (!version) { console.error('Error: --version is required'); process.exit(1); }
  if (!channel) { console.error('Error: --channel is required'); process.exit(1); }
  if (!buildNumber) { console.error('Error: --build-number is required'); process.exit(1); }
  if (!minSupportedVersion) { console.error('Error: --min-supported-version is required'); process.exit(1); }
  if (!updatePackagePath) { console.error('Error: --update-package is required'); process.exit(1); }
  if (!outputDir) { console.error('Error: --output-dir is required'); process.exit(1); }

  async function main() {
    // Compute SHA-256 hash and size of the update package
    let packageBuffer;
    try {
      packageBuffer = await readFile(resolve(updatePackagePath));
    } catch (err) {
      console.error(`Error: Cannot read update package "${updatePackagePath}": ${err.message}`);
      process.exit(1);
    }

    const packageHash = createHash('sha256').update(packageBuffer).digest('hex');
    const packageSize = packageBuffer.length;

    // Build the metadata object
    const metadata = {
      latestVersion: version,
      minSupportedVersion: minSupportedVersion,
      channel: channel,
      buildNumber: parseInt(buildNumber, 10),
      updatePackageSha256: packageHash,
      updatePackageSize: packageSize,
      releaseDate: new Date().toISOString(),
    };

    // Add download URL if provided
    if (downloadUrl) {
      metadata.downloadUrl = downloadUrl;
    }

    // Write updates.json
    const resolvedOutputDir = resolve(outputDir);
    await mkdir(resolvedOutputDir, { recursive: true });
    const outputPath = resolve(resolvedOutputDir, 'updates.json');
    await writeFile(outputPath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

    console.log(`Generated ${outputPath}`);
  }

  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
