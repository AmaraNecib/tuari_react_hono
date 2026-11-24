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
  manifest: { product: 'Tuari', version: '0.9.2', os: 'windows', build: 'abc1234', createdAt: '2026-03-04T10:00:00Z', secret: 'NEVER_RENDER' }, warnings: ['One synthetic input record was unavailable.'],
  events: [
    ['2026-03-02T08:00:00Z', 'info', null, 1], ['2026-03-02T08:00:01Z', 'warn', null, 1],
    ['2026-03-02T08:00:02Z', 'error', 42, 4], ['2026-03-02T08:00:03Z', 'info', null, 1],
    ['2026-03-03T09:00:00Z', 'error', 42, 2], ['2026-03-03T09:01:00Z', 'fatal', 99, 1],
  ].map(([timestamp, level, errorCode, count]) => ({ timestamp, level, errorCode, count, signature: 'NEVER_RENDER', operation: 'NEVER_RENDER', source: 'app', duration: null })),
};
test('selecting an early timeline error moves focus into view and close restores the trigger', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dashboard-context-'));
  const events = Array.from({ length: 500 }, (_, i) => ({
    ...fixture.events[2], timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));
  await emitReport({ ...fixture, events }, join(root, 'report.html'));
  const browser = await chromium.launch({ ...(process.env.VIEWER_BROWSER_EXECUTABLE ? { executablePath: process.env.VIEWER_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(pathToFileURL(join(root, 'report.html')).href);
    await page.getByRole('button', { name: /Timeline/ }).click();
    const trigger = page.getByRole('button', { name: /Show context/ }).first();
    await trigger.press('Enter');
    const panel = page.getByRole('region', { name: 'Event context' });
    await expect(panel).toBeFocused();
    await expect(panel.getByRole('heading')).toBeInViewport();
    await panel.getByRole('button', { name: 'Close context' }).click();
    await expect(trigger).toBeFocused();
  } finally { await browser.close(); }
});

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
    const colors = [];
    const color = async (selector, property, expected, background) => {
      const locator = page.locator(selector).first();
      const cssProperty = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      await expect(locator).toHaveCSS(cssProperty, expected);
      const actual = await locator.evaluate((element, key) => getComputedStyle(element).getPropertyValue(key), cssProperty);
      const record = { selector, property, actual };
      if (background) {
        const luminance = rgb => {
          const channels = rgb.match(/\d+/g).slice(0, 3).map(Number).map(value => {
            const s = value / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const a = luminance(actual), b = luminance(background);
        record.contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(record.contrast >= 4.5, `${selector}: ${record.contrast} contrast`);
      }
      colors.push(record);
    };
    // Pauses are opt-in evidence pacing, never synchronization for assertions.
    const hold = async () => {
      const ms = Number(process.env.VIEWER_WALKTHROUGH_MS || 0);
      if (viewport.width !== 1440 || ms <= 0) return;
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(ms);
      const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
      if (scrolls) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(ms);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    };
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
      await color(':root', 'backgroundColor', 'rgb(250, 250, 250)');
      await color('aside', 'backgroundColor', 'rgb(244, 244, 244)');
      await color('aside', 'color', 'rgb(23, 23, 23)', 'rgb(244, 244, 244)');
      await color('.intro', 'color', 'rgb(89, 89, 89)', 'rgb(250, 250, 250)');
      await color('.primary', 'backgroundColor', 'rgb(180, 80, 42)');
      await color('.primary', 'color', 'rgb(255, 255, 255)', 'rgb(180, 80, 42)');
      await color('nav [aria-current]', 'backgroundColor', 'rgb(240, 240, 240)');
      await color('nav [aria-current]', 'color', 'rgb(23, 23, 23)', 'rgb(240, 240, 240)');
      await color('.warnings', 'backgroundColor', 'rgb(243, 233, 207)');
      await page.locator('.primary').focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await color('.primary', 'outlineColor', 'rgb(180, 80, 42)');
      await expect(page.locator('.primary')).toHaveCSS('outline-style', 'solid');
      if (viewport.width === 1440) {
        assert.equal(await page.locator('aside').evaluate(element => element.getBoundingClientRect().width), 245);
      } else {
        await expect(page.locator('nav button').first()).toHaveCSS('white-space', 'nowrap');
      }
      await page.locator('main').screenshot({ path: join(evidence, 'overview.png') });
      await page.locator('.shell').screenshot({ path: join(evidence, 'overview-shell.png') });
      await hold();
      await page.getByRole('button', { name: /Error signatures/ }).click();
      await expect(page.locator('.signature').first()).toContainText('error:42');
      await expect(page.locator('.frequency').first()).toContainText('6');
      await page.locator('main').screenshot({ path: join(evidence, 'signatures.png') });
      await hold();
      await page.getByRole('button', { name: 'View matching events' }).first().click();
      await expect(page.getByRole('status')).toHaveText('2 matching records');
      await page.getByLabel('day', { exact: true }).selectOption('2026-03-02');
      await page.getByLabel('level', { exact: true }).selectOption('error');
      await expect(page.getByRole('status')).toHaveText('1 matching records');
      await page.getByRole('button', { name: /Show context/ }).first().click();
      await expect(page.getByRole('region', { name: 'Event context' })).toContainText('warn');
      await color('.filters', 'backgroundColor', 'rgb(240, 240, 240)');
      await color('.selected', 'backgroundColor', 'rgb(240, 224, 211)');
      await color('.level.error', 'color', 'rgb(168, 58, 42)', 'rgb(240, 224, 211)');
      await color('.level.warn', 'color', 'rgb(118, 85, 16)', 'rgb(255, 255, 255)');
      await page.locator('main').screenshot({ path: join(evidence, 'timeline.png') });
      await hold();
      await page.getByRole('button', { name: /Error-code lookup/ }).click();
      await page.getByLabel('Error code', { exact: true }).fill('Other-0000002a');
      await page.getByRole('button', { name: 'Find event' }).click();
      await expect(page.getByRole('heading', { name: '2 matching records' })).toBeVisible();
      await page.getByRole('button', { name: /Show context/ }).last().click();
      await expect(page.getByRole('region', { name: 'Event context' })).toContainText('error:99');
      await page.locator('main').screenshot({ path: join(evidence, 'lookup.png') });
      await hold();
      await writeFile(join(evidence, 'computed-colors.json'), JSON.stringify(colors, null, 2));
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
