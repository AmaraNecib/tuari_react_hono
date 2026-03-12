import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

try {
  const indexOutput = runGit(['ls-files', '--stage', '--', 'apps/web']);
  const hasGitlink = indexOutput
    .split(/\r?\n/)
    .some((line) => line.startsWith('160000 ') && /\tapps\/web$/.test(line));

  if (hasGitlink) {
    console.error('apps/web is still indexed as a gitlink (mode 160000).');
    console.error('Remove the gitlink entry and add the real files under apps/web before continuing.');
    process.exit(1);
  }

  console.log('apps/web is tracked as normal files.');
} catch (error) {
  console.error('Unable to validate apps/web tracking mode.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
