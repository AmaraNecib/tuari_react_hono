import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

async function collectExecutables(dir, inventory, relative = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectExecutables(fullPath, inventory, relativePath);
    } else if (entry.name.toLowerCase().endsWith('.exe')) {
      const { size } = await stat(fullPath);
      inventory.push({ path: relativePath, sizeBytes: size });
    }
  }
}

export async function extractAndCollectExecutables(extract, directory) {
  const extraction = extract();
  const executables = [];
  try {
    await collectExecutables(directory, executables);
  } catch (err) {
    if (extraction.status === 0) throw err;
  }
  return { extraction, executables };
}
