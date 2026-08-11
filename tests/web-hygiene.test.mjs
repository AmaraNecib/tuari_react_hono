import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function resolveRepoPath(relativePath) {
  return path.join(rootDir, relativePath);
}

async function readRepoFile(relativePath) {
  return readFile(resolveRepoPath(relativePath), 'utf8');
}

test('web README documents the current Vite and Tauri-connected app', async () => {
  const readme = await readRepoFile('apps/web/README.md');

  assert.match(readme, /^# @tuari\/web$/m);
  assert.match(readme, /Vite-powered web shell/i);
  assert.match(readme, /TanStack Router/);
  assert.match(readme, /TanStack Query/);
  assert.match(readme, /Tauri runtime bridge/i);
  assert.match(readme, /pnpm --filter @tuari\/web dev/);
  assert.match(readme, /VITE_API_URL/);
  assert.doesNotMatch(readme, /Next\.js|create-next-app|next\/font/i);
});

test('web workspace does not keep the backup components manifest', async () => {
  await assert.rejects(
    access(resolveRepoPath('apps/web/components.json.bak'), constants.F_OK),
    /ENOENT/,
  );
});

test('splashscreen is a dependency-free, CSP-safe static page', async () => {
  const splashscreen = await readRepoFile('apps/web/public/splashscreen.html');

  assert.match(splashscreen, /Tuari/);
  assert.match(splashscreen, /نظام إدارة/);
  // The app CSP forbids inline scripts (script-src 'self') — the
  // splashscreen must never introduce one, or the window shows nothing.
  assert.doesNotMatch(splashscreen, /<script/i);
  // Dependency-free: no external resources may be fetched.
  assert.doesNotMatch(splashscreen, /https?:\/\//i);
});

test('tauri config keeps the main window hidden behind a splashscreen window', async () => {
  const config = JSON.parse(await readRepoFile('apps/desktop/src-tauri/tauri.conf.json'));
  const windows = config.app.windows;

  const mainWindow = windows.find((window) => window.label === 'main');
  assert.ok(mainWindow, 'main window must have an explicit label');
  assert.equal(mainWindow.visible, false, 'main window must start hidden');

  const splashscreenWindow = windows.find((window) => window.label === 'splashscreen');
  assert.ok(splashscreenWindow, 'splashscreen window must exist');
  assert.equal(splashscreenWindow.url, 'splashscreen.html');
  assert.equal(splashscreenWindow.resizable, false);
  assert.equal(splashscreenWindow.center, true);
});

test('agent branch PR template has no trailing whitespace noise', async () => {
  const template = await readRepoFile('.github/PULL_REQUEST_TEMPLATE/agent-branch.md');
  const noisyLine = template.split(/\r?\n/).find((line) => line !== line.trimEnd());

  assert.equal(noisyLine, undefined);
});

test('root package scripts keep web hygiene validation in normal checks', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));

  assert.equal(packageJson.scripts['check:web-hygiene'], 'node --test ./tests/web-hygiene.test.mjs');
  assert.match(packageJson.scripts.lint, /check:web-hygiene/);
  assert.match(packageJson.scripts.test, /check:web-hygiene/);
});

test('fonts are self-hosted: index.html has no Google Fonts links or preconnects', async () => {
  const html = await readRepoFile('apps/web/index.html');

  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /fonts\.gstatic\.com/);
  assert.doesNotMatch(html, /preconnect/i);
});

test('fonts are self-hosted: styles.css never imports Google Fonts CSS', async () => {
  const css = await readRepoFile('apps/web/src/styles.css');

  assert.doesNotMatch(css, /googleapis\.com/);
  assert.doesNotMatch(css, /gstatic\.com/);
});

test('fonts are self-hosted: every family the design tokens reference is declared', async () => {
  const css = await readRepoFile('apps/web/src/styles.css');

  // Each family the token stack references must be declared: static families
  // come in via @fontsource @imports (their @font-face lives in the package css),
  // variable families via hand-written @font-face blocks in styles.css.
  const expectedFamilies = [
    ['Instrument Serif', 'instrument-serif'],
    ['Inter Tight Variable', 'inter-tight'],
    ['JetBrains Mono Variable', 'jetbrains-mono'],
    ['IBM Plex Sans Arabic', 'ibm-plex-sans-arabic'],
    ['Amiri', 'amiri'],
    ['Noto Naskh Arabic', 'noto-naskh-arabic'],
    ['Noto Sans Arabic Variable', 'noto-sans-arabic'],
  ];

  for (const [family, fontsourcePackage] of expectedFamilies) {
    // fontsource CSS uses single quotes, hand-written @font-face uses double.
    const familyDecl = new RegExp(`font-family:\\s*["']${family}["']`);
    const imported = css.includes(`@import "@fontsource/${fontsourcePackage}`);
    assert.ok(
      familyDecl.test(css) || imported,
      `expected family "${family}" to be declared in apps/web/src/styles.css ` +
        `(via @fontsource/${fontsourcePackage} import or an inline @font-face)`,
    );
  }
});
