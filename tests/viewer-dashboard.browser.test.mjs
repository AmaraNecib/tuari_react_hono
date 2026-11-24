import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emitReport } from '../scripts/viewer/pipeline.mjs';
const { chromium, expect } = await import(process.env.VIEWER_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.VIEWER_PLAYWRIGHT_MODULE)).href : '@playwright/test');
const fixture = {
  schemaVersion: 1, productPrefix: 'TUARI',
  manifest: { product: 'Tuari', version: '0.9.2', os: 'windows', build: 'abc1234', createdAt: '2026-03-04T10:00:00Z', secret: 'NEVER_RENDER' }, warnings: [],
  events: [
    ['2026-03-02T08:00:00Z', 'info', null, 1], ['2026-03-02T08:00:01Z', 'warn', null, 1],
    ['2026-03-02T08:00:02Z', 'error', 42, 4], ['2026-03-02T08:00:03Z', 'info', null, 1],
    ['2026-03-03T09:00:00Z', 'error', 42, 2], ['2026-03-03T09:01:00Z', 'fatal', 99, 1],
  ].map(([timestamp, level, errorCode, count]) => ({ timestamp, level, errorCode, count, signature: 'NEVER_RENDER', operation: 'NEVER_RENDER', source: 'app', duration: null })),
};
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`all dashboard views work offline at ${viewport.width}px with no network`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dashboard-browser-'));
    const evidence = process.env.VIEWER_EVIDENCE_DIR ? join(resolve(process.env.VIEWER_EVIDENCE_DIR), String(viewport.width)) : root;
    await mkdir(evidence, { recursive: true });
    await emitReport(fixture, join(root, 'report.html'));
    if (process.env.VIEWER_BEFORE_MODULE) {
      const before = await import(pathToFileURL(resolve(process.env.VIEWER_BEFORE_MODULE)).href);
      await before.emitReport(fixture, join(root, 'before/report.html'));
    }
    const browser = await chromium.launch({ headless: true, ...(process.env.VIEWER_BROWSER_EXECUTABLE ? { executablePath: process.env.VIEWER_BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport, recordVideo: { dir: evidence, size: viewport } });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await context.setOffline(true);
    try {
      if (process.env.VIEWER_BEFORE_MODULE) {
        await page.goto(pathToFileURL(join(root, 'before/report.html')).href);
        await expect(page.locator('#report')).toContainText('"events"');
        await page.locator('body').screenshot({ path: join(evidence, 'before.png') });
      }
      await page.goto(pathToFileURL(join(root, 'report.html')).href);
      await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Report summary' })).toContainText('10');
      assert.deepEqual(JSON.parse(await page.locator('#report-data').textContent()), JSON.parse(await readFile(join(root, 'report-data.json'), 'utf8')));
      assert.ok(!(await page.locator('body').textContent()).includes('NEVER_RENDER'));
      await page.locator('main').screenshot({ path: join(evidence, 'overview.png') });
      await page.getByRole('button', { name: /Error signatures/ }).click();
      await expect(page.locator('.signature').first()).toContainText('error:42');
      await expect(page.locator('.frequency').first()).toContainText('6');
      await page.locator('main').screenshot({ path: join(evidence, 'signatures.png') });
      await page.getByRole('button', { name: 'View matching events' }).first().click();
      await expect(page.getByRole('status')).toHaveText('2 matching records');
      await page.getByLabel('day', { exact: true }).selectOption('2026-03-02');
      await page.getByLabel('level', { exact: true }).selectOption('error');
      await expect(page.getByRole('status')).toHaveText('1 matching records');
      await page.getByRole('button', { name: /Show context/ }).first().click();
      await expect(page.getByRole('region', { name: 'Event context' })).toContainText('warn');
      await page.locator('main').screenshot({ path: join(evidence, 'timeline.png') });
      await page.getByRole('button', { name: /Error-code lookup/ }).click();
      await page.getByLabel('Error code', { exact: true }).fill('Other-0000002a');
      await page.getByRole('button', { name: 'Find event' }).click();
      await expect(page.getByRole('heading', { name: '2 matching records' })).toBeVisible();
      await page.getByRole('button', { name: /Show context/ }).last().click();
      await expect(page.getByRole('region', { name: 'Event context' })).toContainText('error:99');
      await page.locator('main').screenshot({ path: join(evidence, 'lookup.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.getByLabel('Error code', { exact: true }).fill('bad-code');
      await page.getByRole('button', { name: 'Find event' }).click();
      await expect(page.getByText('No match. Check the code or try another report.')).toBeVisible();
      assert.deepEqual(errors, []);
      assert.ok(requests.every(url => url.startsWith('file:')));
      await writeFile(join(evidence, 'privacy.json'), JSON.stringify({ viewport, browser: browser.version(), offline: true, requests, errors, report: join(root, 'report.html') }, null, 2));
    } finally { await context.close(); await browser.close(); }
  });
}
