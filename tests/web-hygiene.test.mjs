import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
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

function isIdentifierChar(char) {
  return /[A-Za-z0-9_$]/.test(char ?? '');
}

/** Advance past a string or template literal starting at `start`; returns the index after it. */
function skipString(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return index;
}

function skipLineComment(source, start) {
  const newline = source.indexOf('\n', start + 2);
  return newline === -1 ? source.length : newline + 1;
}

function skipBlockComment(source, start) {
  const end = source.indexOf('*/', start + 2);
  return end === -1 ? source.length : end + 2;
}

/** The 1-based line number of `index` in `source`. */
function lineNumberAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\n') line += 1;
  }
  return line;
}

/** Match a forbidden formatter callee at `index`, ignoring identifier prefixes. */
function matchFormatterAt(source, index) {
  if (isIdentifierChar(source[index - 1])) return null;
  const rest = source.slice(index);

  let match = /^toLocaleDateString\s*\(/.exec(rest);
  if (match) return { name: 'toLocaleDateString', length: match[0].length };

  match = /^(?:new\s+)?Intl\.DateTimeFormat\s*\(/.exec(rest);
  if (match) return { name: 'Intl.DateTimeFormat', length: match[0].length };

  return null;
}

/** Index of the `)` that closes the `(` at `openIndex`, skipping strings and comments. */
function findMatchingParen(source, openIndex) {
  let depth = 0;
  let index = openIndex;
  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index = skipString(source, index);
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return source.length - 1;
}

/**
 * Every `toLocaleDateString(...)` / `new Intl.DateTimeFormat(...)` call whose
 * balanced parentheses do not contain a `timeZone`. Mentions in comments or
 * string literals are not calls and are never reported.
 */
export function findUnpinnedDateFormatters(source) {
  const violations = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index = skipString(source, index);
      continue;
    }

    const formatter = matchFormatterAt(source, index);
    if (!formatter) {
      index += 1;
      continue;
    }

    const openParen = index + formatter.length - 1;
    const closeParen = findMatchingParen(source, openParen);
    const call = source.slice(index, closeParen + 1);
    if (!/\btimeZone\b/.test(call)) {
      violations.push({ line: lineNumberAt(source, index), callee: formatter.name, call });
    }
    index = closeParen + 1;
  }

  return violations;
}

/** Every production web source file (`.ts`/`.tsx`, tests excluded). */
async function listProductionWebSources() {
  const root = resolveRepoPath('apps/web/src');
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else files.push(full);
    }
  }
  return files.filter(
    (file) => /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.(ts|tsx)$/.test(file),
  );
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

test('every production web date formatter is pinned to a timezone', async () => {
  const files = await listProductionWebSources();
  // Guard against a silent filter drift (an empty list would pass vacuously).
  assert.ok(files.length > 0, 'the production web scan must find source files');
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const violation of findUnpinnedDateFormatters(source)) {
      const relative = path.relative(rootDir, file).split(path.sep).join('/');
      violations.push(`${relative}:${violation.line}: ${violation.callee}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `unpinned date formatter(s) — call formatAlgeriaDate, or pass timeZone: getAlgeriaTimeZone():\n${violations.join('\n')}`,
  );
});

test('date formatter scanner self-test: pinned passes, unpinned flags, comments do not pass vacuously', () => {
  const pinned = [
    'const a = new Date(x).toLocaleDateString("ar-DZ", { timeZone: getAlgeriaTimeZone() })',
    'const b = new Intl.DateTimeFormat("ar-DZ", { year: "numeric", timeZone: getAlgeriaTimeZone() }).format(d)',
    'const c = new Intl.DateTimeFormat("ar-DZ", { timeZone }).format(d)',
  ].join('\n');
  assert.deepEqual(findUnpinnedDateFormatters(pinned), []);

  const unpinned = [
    'const a = new Date(x).toLocaleDateString("ar-DZ")',
    'const b = new Intl.DateTimeFormat("ar-DZ").format(d)',
  ].join('\n');
  const found = findUnpinnedDateFormatters(unpinned);
  assert.deepEqual(
    found.map((violation) => violation.callee),
    ['toLocaleDateString', 'Intl.DateTimeFormat'],
  );
  assert.deepEqual(
    found.map((violation) => violation.line),
    [1, 2],
  );

  // A mention in a comment or a string is not a call: the scanner must not flag
  // it, and the rule must not pass by simply finding nothing anywhere.
  const mentions = [
    '// Do not call toLocaleDateString() without a timeZone.',
    '/* new Intl.DateTimeFormat("ar-DZ") is banned. */',
    'const note = "toLocaleDateString("',
  ].join('\n');
  assert.deepEqual(findUnpinnedDateFormatters(mentions), []);

  // A pinned call with nested parentheses/strings stays balanced.
  const nested = 'new Intl.DateTimeFormat("ar-DZ", { timeZone: fn("a)b", (x) => x) }).format(d)';
  assert.deepEqual(findUnpinnedDateFormatters(nested), []);
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
