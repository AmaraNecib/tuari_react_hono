import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Clear only known outputs from a smoke-owned extraction, never arbitrary files.
export function resetOwnedExtraction(directory) {
  if (!existsSync(join(directory, '.tuari-smoke-extract'))) {
    throw new Error('Cannot reset extraction without the smoke ownership marker');
  }
  for (const name of ['Tuari.exe', 'bin', 'data', 'resources']) {
    rmSync(join(directory, name), { recursive: true, force: true });
  }
}
