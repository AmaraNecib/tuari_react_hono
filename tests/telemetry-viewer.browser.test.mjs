import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// An explicit module path lets local proof reuse an already installed workspace.
const { chromium, expect } = await import(process.env.VIEWER_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.VIEWER_PLAYWRIGHT_MODULE)).href : '@playwright/test');
const cli = fileURLToPath(new URL('../scripts/tuari-viewer.mjs', import.meta.url));

async function openReport(input, check) {
  const root = await mkdtemp(join(tmpdir(), 'viewer-browser-'));
  const output = join(root, 'report.html');
  execFileSync(process.execPath, [cli, input, '-o', output]);
  const sidecar = JSON.parse(await readFile(join(root, 'report-data.json'), 'utf8'));
  const profile = await mkdtemp(join(tmpdir(), 'viewer-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.VIEWER_BROWSER_EXECUTABLE ? { executablePath: process.env.VIEWER_BROWSER_EXECUTABLE } : {}),
  });
  try {
    const errors = [], network = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith('file:')) network.push(request.url()); });
    await context.setOffline(true);
    await page.goto(pathToFileURL(output).href);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    const rendered = JSON.parse(await page.locator('#report-data').textContent());
    await expect(page.getByRole('region', { name: 'Report summary' })).toContainText('log records');
    assert.deepEqual(rendered, sidecar);
    await check(rendered);
    await expect(page.locator('img')).toHaveCount(0);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log(`file:// report rendered offline; ${rendered.events.length} events; browser ${context.browser().version()}`);
  } finally { await context.close(); }
}

test('folder CLI report executes its real sidecar script offline from file://', async () => {
  await openReport(fileURLToPath(new URL('./fixtures/viewer/', import.meta.url)), data => {
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].errorCode, 42);
    assert.equal(data.events[0].timestamp, '2026-01-02T01:02:03+03:00');
    assert.equal(data.events[0].operation, null);
  });
});

test('real six-event native #618 ZIP renders offline with producer metadata', {
  skip: !process.env.VIEWER_NATIVE_618_ZIP && 'Set VIEWER_NATIVE_618_ZIP to the independently captured native export',
}, async () => {
  const input = process.env.VIEWER_NATIVE_618_ZIP;
  assert.equal(createHash('sha256').update(await readFile(input)).digest('hex'),
    '3846776ea5c371c07fea974c8b8c553ee59c8f83c942dd851f9ad0439ddfe1a9');
  await openReport(input, data => {
    assert.equal(data.events.length, 6);
    assert.equal(data.manifest.version, '0.1.0');
    assert.equal(data.manifest.os, 'windows');
    assert.equal(data.manifest.build, 'unknown');
    assert.deepEqual(data.events.map(event => event.source), ['desktop', 'desktop', 'api', 'api', 'api', 'api']);
    assert.equal(data.events[0].timestamp, '2026-11-24T16:28:50.344+01:00');
    assert.equal(data.events[5].level, 'error');
    assert.equal(data.events[5].timestamp, '2026-11-24T16:32:06.692+01:00');
    assert.deepEqual(data.warnings, []);
  });
});
