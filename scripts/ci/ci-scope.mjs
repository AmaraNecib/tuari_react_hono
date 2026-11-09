import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { globToRegExp, selectAreas } from './e2e-selection.mjs';

const fullScope = () => ({
  api: 'true', web: 'true', rust: 'true', e2e_mode: 'full', e2e_specs: '',
});

export function selectCiScope(files, { event = 'pull_request', full = false } = {}) {
  if (event !== 'pull_request' || full) return fullScope();
  const areas = selectAreas(files);
  if (areas.gate === 'full') return fullScope();
  const rustPaths = [
    'apps/desktop/**', 'scripts/generate-license.mjs',
    '.cargo/**', 'rust-toolchain*',
  ].map(globToRegExp);
  return {
    api: areas.api === '1' ? 'true' : 'false',
    web: areas.web === '1' ? 'true' : 'false',
    rust: files.some((file) => rustPaths.some((pattern) => pattern.test(file))) ? 'true' : 'false',
    e2e_mode: areas.e2e_mode,
    e2e_specs: areas.e2e_specs.join(' '),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean);
  const scope = selectCiScope(files, {
    event: process.env.CI_EVENT,
    full: process.env.CI_FULL === 'true',
  });
  for (const [key, value] of Object.entries(scope)) console.log(`${key}=${value}`);
}
