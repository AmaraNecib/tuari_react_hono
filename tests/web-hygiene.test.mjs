import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function resolveRepoPath(relativePath) {
  return path.join(rootDir, relativePath);
}

async function readRepoFile(relativePath) {
  return readFile(resolveRepoPath(relativePath), 'utf8');
}

function formatterName(expression) {
  expression = unwrapExpression(expression);
  if (ts.isIdentifier(expression) && expression.text === 'toLocaleDateString') {
    return 'toLocaleDateString';
  }
  let memberName;
  if (ts.isPropertyAccessExpression(expression)) {
    memberName = expression.name.text;
  } else if (ts.isElementAccessExpression(expression)) {
    const member = expression.argumentExpression;
    if (!member || (!ts.isStringLiteral(member) && !ts.isNoSubstitutionTemplateLiteral(member))) return null;
    memberName = member.text;
  } else {
    return null;
  }
  if (memberName === 'toLocaleDateString') return 'toLocaleDateString';
  // Receiver-shape guard, not type analysis: unknown bindings remain allowed
  // because numbers use the same method for money. All current instant sites
  // construct their Date inline. Aliases and factory returns are not inferred.
  const receiver = unwrapExpression(expression.expression);
  if (memberName === 'toLocaleString' && ts.isNewExpression(receiver)) {
    const constructor = unwrapExpression(receiver.expression);
    if (ts.isIdentifier(constructor) && constructor.text === 'Date') {
      return 'Date.toLocaleString';
    }
  }
  if (
    memberName === 'DateTimeFormat' &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'Intl'
  ) {
    return 'Intl.DateTimeFormat';
  }
  return null;
}

function unwrapExpression(expression) {
  while (expression && (
    ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  )) {
    expression = expression.expression;
  }
  return expression;
}

function hasUsableTimeZoneValue(value) {
  value = unwrapExpression(value);
  if (ts.isConditionalExpression(value)) {
    return hasUsableTimeZoneValue(value.whenTrue) && hasUsableTimeZoneValue(value.whenFalse);
  }
  return value.kind !== ts.SyntaxKind.NullKeyword &&
    !ts.isVoidExpression(value) &&
    !(ts.isIdentifier(value) && value.text === 'undefined') &&
    !((ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) && value.text.trim() === '');
}

function hasUsableTimeZoneOption(options) {
  options = unwrapExpression(options);
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  let pinned = false;
  for (const property of options.properties) {
    if (ts.isSpreadAssignment(property)) {
      pinned = false;
      continue;
    }
    let name = property.name;
    if (name && ts.isComputedPropertyName(name)) {
      name = unwrapExpression(name.expression);
      if (!ts.isStringLiteral(name) && !ts.isNoSubstitutionTemplateLiteral(name)) {
        // An unknown key may overwrite a previous timezone option.
        pinned = false;
        continue;
      }
    }
    if (!name || (!ts.isIdentifier(name) && !ts.isStringLiteral(name) &&
      !ts.isNoSubstitutionTemplateLiteral(name)) || name.text !== 'timeZone') {
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      // Require an explicit value rather than assuming this binding is usable.
      pinned = false;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      pinned = false;
      continue;
    }
    pinned = hasUsableTimeZoneValue(property.initializer);
  }
  return pinned;
}

/** Find real date formatter calls whose own options do not pin a timezone. */
export function findUnpinnedDateFormatters(source, fileName = 'source.tsx') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const violations = [];
  function visit(node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = formatterName(node.expression);
      if (callee && !hasUsableTimeZoneOption(node.arguments?.[1])) {
        const position = file.getLineAndCharacterOfPosition(node.expression.getStart(file));
        violations.push({ line: position.line + 1, callee, call: node.getText(file) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
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
    (file) =>
      /\.(ts|tsx|mts|cts)$/.test(file) &&
      !/\.(test|spec)\.(ts|tsx|mts|cts)$/.test(file) &&
      !/(^|[/\\])(test-utils|__test-utils__|__tests__|__mocks__)[/\\]/.test(file),
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

test('production web source pins date formatters, including constructed Date.toLocaleString()', async () => {
  const files = await listProductionWebSources();
  // Guard against a silent filter drift (an empty list would pass vacuously).
  assert.ok(files.length > 0, 'the production web scan must find source files');
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const violation of findUnpinnedDateFormatters(source, file)) {
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
    // A nonempty quoted zone is a valid pin: a valid `Africa/Algiers` literal
    // must not be reported as unpinned (it would fail lint and test).
    'const d = new Intl.DateTimeFormat("ar-DZ", { timeZone: "Africa/Algiers" }).format(d)',
    "const e = new Date(x).toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' })",
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

  const regexApostrophe = [
    "const quote = /[']/;",
    'date.toLocaleDateString("ar-DZ")',
  ].join("\n");
  assert.deepEqual(
    findUnpinnedDateFormatters(regexApostrophe).map((violation) => violation.line),
    [2],
  );

  const jsxApostrophe = `<p>don't {date.toLocaleDateString("ar-DZ")}</p>`;
  assert.deepEqual(
    findUnpinnedDateFormatters(jsxApostrophe).map((violation) => violation.line),
    [1],
  );

  // A pinned call with nested parentheses/strings stays balanced.
  const nested = 'new Intl.DateTimeFormat("ar-DZ", { timeZone: fn("a)b", (x) => x) }).format(d)';
  assert.deepEqual(findUnpinnedDateFormatters(nested), []);

  // Unbalanced input is flagged rather than letting a later `timeZone` mask it.
  assert.equal(findUnpinnedDateFormatters('const a = new Intl.DateTimeFormat("ar-DZ"').length, 1);

  // A `timeZone` key with no usable value is not a pin: `undefined`, `null`,
  // `""` and a comment merely mentioning the word all leave the call unpinned.
  const valuelessPins = [
    'const a = new Date(x).toLocaleDateString("ar-DZ", { timeZone: undefined })',
    'const b = new Intl.DateTimeFormat("ar-DZ", { timeZone: "" }).format(d)',
    'const c = new Date(x).toLocaleDateString("ar-DZ", opts /* timeZone lives in opts */)',
    // A commented-out option is not a pin: stripping it leaves the real call
    // using the machine zone, so it must stay flagged.
    'const f = d.toLocaleDateString("ar-DZ", { /* timeZone: getAlgeriaTimeZone() */ })',
  ].join('\n');
  assert.deepEqual(
    findUnpinnedDateFormatters(valuelessPins).map((violation) => violation.line),
    [1, 2, 3, 4],
  );

  // The pinned not being skipped means an unpinned call nested inside a pinned
  // call is still reported.
  const nestedInner =
    'new Intl.DateTimeFormat("ar-DZ", { timeZone: getAlgeriaTimeZone() }).format(new Date(d.toLocaleDateString("ar-DZ")))';
  assert.deepEqual(
    findUnpinnedDateFormatters(nestedInner).map((violation) => violation.callee),
    ['toLocaleDateString'],
  );
});

test('date formatter scanner distinguishes constructed Date receivers from money, including templates', () => {
  const source = [
    'new Date(stamp).toLocaleString("ar-DZ")',
    'const csv = `Generated: ${new Date(stamp).toLocaleString("ar-DZ")}`',
    '(new Date(stamp))["toLocaleString"]("ar-DZ")',
    'new Date(stamp)?.toLocaleString("ar-DZ")',
    'new Date(stamp).toLocaleString("ar-DZ", { timeZone: undefined })',
    'new Date(stamp).toLocaleString("ar-DZ", { timeZone: "Africa/Algiers", ...options })',
  ].join(';\n');
  assert.deepEqual(
    findUnpinnedDateFormatters(source).map(({ line, callee }) => ({ line, callee })),
    [1, 2, 3, 4, 5, 6].map((line) => ({ line, callee: 'Date.toLocaleString' })),
  );
  const allowed = [
    'new Date(stamp).toLocaleString("ar-DZ", { timeZone: "Africa/Algiers" })',
    'const csv = `Generated: ${new Date(stamp).toLocaleString("ar-DZ", { timeZone: getAlgeriaTimeZone() })}`',
    '(100_000).toLocaleString("ar-DZ")',
    'amount.toLocaleString("ar-DZ")',
    'charge.amountDzd.toLocaleString("ar-DZ")',
    'Number(value).toLocaleString("ar-DZ")',
    'const note = `new Date(stamp).toLocaleString("ar-DZ")`',
    '// new Date(stamp).toLocaleString("ar-DZ")',
  ].join('\n');
  assert.deepEqual(findUnpinnedDateFormatters(allowed), []);
});

test('date formatter scanner inspects template expressions without treating template text as code', () => {
  const source = [
    'const label = `Date: ${date.toLocaleDateString("ar-DZ")}`;',
    'const pinned = `Date: ${date.toLocaleDateString("ar-DZ", { timeZone: "Africa/Algiers" })}`;',
    'const mention = `date.toLocaleDateString("ar-DZ")`;',
    'const nested = `Outer ${`Inner ${new Intl.DateTimeFormat("ar-DZ").format(date)}`}`;',
  ].join('\n');
  assert.deepEqual(
    findUnpinnedDateFormatters(source).map(({ line, callee }) => ({ line, callee })),
    [
      { line: 1, callee: 'toLocaleDateString' },
      { line: 4, callee: 'Intl.DateTimeFormat' },
    ],
  );
});

test('date formatter scanner checks only effective timezone options on that call', () => {
  const unpinned = [
    'date.toLocaleDateString("ar-DZ", { unrelated: { timeZone: "Africa/Algiers" } })',
    'date.toLocaleDateString("ar-DZ", { timeZone: "Africa/Algiers", ...options })',
    'date.toLocaleDateString("ar-DZ", { timeZone: void 0 })',
    'date.toLocaleDateString("ar-DZ", { timeZone: "  " })',
    'date.toLocaleDateString("ar-DZ", { timeZone: "Africa/Algiers", timeZone: undefined })',
    'date.toLocaleDateString("ar-DZ", { timeZone: null })',
  ].join('\n');
  assert.deepEqual(
    findUnpinnedDateFormatters(unpinned).map(({ line }) => line),
    [1, 2, 3, 4, 5, 6],
  );
  const pinned = [
    'date.toLocaleDateString("ar-DZ", { ...options, "timeZone": "Africa/Algiers" })',
    'date.toLocaleDateString("ar-DZ", { timeZone: (getAlgeriaTimeZone() as string) })',
  ].join('\n');
  assert.deepEqual(findUnpinnedDateFormatters(pinned), []);
});

test('date formatter scanner recognizes literal computed member names', () => {
  const unpinned = [
    'date["toLocaleDateString"]("ar-DZ")',
    'new Intl["DateTimeFormat"]("ar-DZ").format(date)',
    'date[`toLocaleDateString`]("ar-DZ")',
    'Intl[`DateTimeFormat`]("ar-DZ").format(date)',
  ].join('\n');
  assert.deepEqual(
    findUnpinnedDateFormatters(unpinned).map(({ line, callee }) => ({ line, callee })),
    [
      { line: 1, callee: 'toLocaleDateString' },
      { line: 2, callee: 'Intl.DateTimeFormat' },
      { line: 3, callee: 'toLocaleDateString' },
      { line: 4, callee: 'Intl.DateTimeFormat' },
    ],
  );
  const pinned = [
    'date["toLocaleDateString"]("ar-DZ", { timeZone: "Africa/Algiers" })',
    'new Intl["DateTimeFormat"]("ar-DZ", { timeZone: getAlgeriaTimeZone() }).format(date)',
    'date[`toLocaleDateString`]("ar-DZ", { timeZone: "Africa/Algiers" })',
    'Intl[`DateTimeFormat`]("ar-DZ", { timeZone: getAlgeriaTimeZone() }).format(date)',
  ].join('\n');
  assert.deepEqual(findUnpinnedDateFormatters(pinned), []);
});

test('date formatter scanner unwraps options without hiding invalid timezone values', () => {
  const wrappers = [
    (options) => `(${options})`,
    (options) => `${options} as const`,
    (options) => `${options} satisfies Intl.DateTimeFormatOptions`,
    (options) => `(${options} as const)!`,
    (options) => `<Intl.DateTimeFormatOptions>${options}`,
  ];
  for (const wrap of wrappers) {
    for (const formatter of ['date.toLocaleDateString', 'new Intl.DateTimeFormat']) {
      const scan = (options) => findUnpinnedDateFormatters(
        `${formatter}("ar-DZ", ${wrap(options)})`, 'source.ts',
      );
      assert.deepEqual(scan('{ timeZone: "Africa/Algiers" }'), []);
      assert.deepEqual(scan('{ timeZone: getAlgeriaTimeZone() }'), []);
      for (const options of [
        '{}', '{ timeZone: undefined }', '{ timeZone: null }',
        '{ timeZone: "" }', '{ timeZone: void 0 }',
        '{ timeZone: "Africa/Algiers", ...options }',
      ]) {
        assert.equal(scan(options).length, 1, `${formatter}: ${wrap(options)}`);
      }
    }
  }
});

test('date formatter scanner does not trust shorthand timezone values', () => {
  const source = [
    'const timeZone = undefined;',
    'date.toLocaleDateString("ar-DZ", { timeZone })',
    'new Intl.DateTimeFormat("ar-DZ", { ...options, timeZone }).format(date)',
  ].join('\n');
  assert.deepEqual(
    findUnpinnedDateFormatters(source).map(({ line }) => line),
    [2, 3],
  );
});

test('date formatter scanner handles computed timezone overrides in source order', () => {
  const scan = (options) => findUnpinnedDateFormatters(`date.toLocaleDateString("ar-DZ", ${options})`);
  for (const options of [
    '{ timeZone: "Africa/Algiers", ["timeZone"]: undefined }',
    '{ timeZone: "Africa/Algiers", [`timeZone`]: null }',
    '{ timeZone: "Africa/Algiers", [key]: value }',
    '{ ["timeZone"]: "Africa/Algiers", timeZone: undefined }',
  ]) {
    assert.equal(scan(options).length, 1, options);
  }
  for (const options of [
    '{ ["timeZone"]: "Africa/Algiers" }',
    '{ timeZone: undefined, [`timeZone`]: "Africa/Algiers" }',
    '{ [key]: value, timeZone: "Africa/Algiers" }',
    '{ timeZone: "Africa/Algiers", ["year"]: "numeric" }',
  ]) {
    assert.equal(scan(options).length, 0, options);
  }
});

test('date formatter scanner checks wrapped callees and conditional timezone branches', () => {
  for (const callee of ['(date.toLocaleDateString)', '((date.toLocaleDateString))', 'new (Intl.DateTimeFormat)', '(date.toLocaleDateString as Function)']) {
    assert.equal(findUnpinnedDateFormatters(`${callee}("ar-DZ")`).length, 1, callee);
    assert.equal(findUnpinnedDateFormatters(`${callee}("ar-DZ", { timeZone: "Africa/Algiers" })`).length, 0, callee);
  }
  for (const value of [
    'flag ? "Africa/Algiers" : undefined',
    'flag ? null : "Africa/Algiers"',
    'flag ? "Africa/Algiers" : void 0',
    'flag ? "" : "Africa/Algiers"',
    'flag ? "Africa/Algiers" : (other ? "UTC" : undefined)',
  ]) {
    assert.equal(findUnpinnedDateFormatters(`date.toLocaleDateString("ar-DZ", { timeZone: ${value} })`).length, 1, value);
  }
  assert.equal(findUnpinnedDateFormatters('date.toLocaleDateString("ar-DZ", { timeZone: flag ? "Africa/Algiers" : "UTC" })').length, 0);
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
