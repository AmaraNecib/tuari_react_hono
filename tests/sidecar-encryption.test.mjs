import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("packages both SQLite drivers and loads the shipped encrypted prebuild without compilation", async (t) => {
  const apiRequire = createRequire(join(root, "apps", "api", "package.json"));
  try {
    apiRequire.resolve("better-sqlite3");
    apiRequire.resolve("better-sqlite3-multiple-ciphers");
  } catch (error) {
    assert.ok(!process.env.CI, `CI requires both SQLite native packages: ${error.message}`);
    t.skip("SQLite native packages are not installed in this worktree.");
    return;
  }

  mkdirSync(join(root, ".scratch", "sessions"), { recursive: true });
  const fixture = mkdtempSync(join(root, ".scratch", "sessions", "sidecar-test-"));
  try {
    const scripts = join(fixture, "apps", "desktop", "scripts");
    const api = join(fixture, "apps", "api");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(api, { recursive: true });
    for (const file of ["build-sidecar.mjs", "script-security-utils.mjs"]) {
      copyFileSync(join(root, "apps", "desktop", "scripts", file), join(scripts, file));
    }
    writeFileSync(join(api, "package.json"), "{}");
    // Input dependencies are real installed packages. Output must contain no links.
    symlinkSync(resolve(root, "apps", "api", "node_modules"), join(api, "node_modules"), "junction");
    const pnpmStub = join(fixture, "pnpm-test.mjs");
    writeFileSync(pnpmStub, `
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const args = process.argv.slice(2);
      if (args.join(' ') !== '--filter @tuari/api build') {
        throw new Error('Compilation/rebuild is forbidden: ' + args.join(' '));
      }
      const dist = join(process.cwd(), 'apps/api/dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'index.cjs'), '// Build boundary stub. No actual build runs.');
    `);
    const result = spawnSync(process.execPath, [join(scripts, "build-sidecar.mjs")], {
      cwd: fixture, encoding: "utf8", env: { ...process.env, npm_execpath: pnpmStub },
      timeout: 120_000,
    });
    assert.equal(result.error, undefined, `Sidecar packaging subprocess failed: ${result.error?.message}`);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /Compilation\/rebuild is forbidden|Falling back/);
    const runtime = join(fixture, "apps", "desktop", "src-tauri", "bin", "api-runtime");
    const probe = join(runtime, "probe.cjs");
    writeFileSync(probe, `
      const assert = require('node:assert/strict');
      for (const name of ['better-sqlite3-multiple-ciphers','better-sqlite3']) {
        assert.ok(require.resolve(name).startsWith(__dirname), name + ' escaped packaged runtime');
      }
      const D = require('better-sqlite3-multiple-ciphers');
      const packageDir = require('node:path').join(require('node:path').dirname(
        require.resolve('better-sqlite3-multiple-ciphers')), '..');
      const binding = require(require('node:path').join(packageDir, 'lib', 'binding.js'));
      const prebuild = binding.getPrebuildPath();
      assert.ok(prebuild && prebuild.includes('prebuilds'));
      assert.ok(prebuild.startsWith(__dirname));
      assert.ok(!require('node:fs').existsSync(require('node:path').join(
        packageDir,
        'build', 'Release', 'better_sqlite3.node')));
      const db = new D(require('node:path').join(__dirname, 'keyed.db'));
      db.pragma("cipher='sqlcipher'"); db.pragma('legacy=4'); db.pragma("key='packaged-key'");
      db.exec('CREATE TABLE t(v); INSERT INTO t VALUES(42)'); db.close();
      const copy = new D(require('node:path').join(__dirname, 'keyed.db'));
      copy.pragma("cipher='sqlcipher'"); copy.pragma('legacy=4'); copy.pragma("key='packaged-key'");
      assert.equal(copy.prepare('SELECT v FROM t').get().v,42); copy.close();
      const plain = new (require('better-sqlite3'))(':memory:');
      assert.equal(plain.prepare('SELECT 1 AS v').get().v,1); plain.close();
      console.log(prebuild);
    `);
    const bundledNode = join(fixture, "apps", "desktop", "src-tauri", "bin", "node.exe");
    const loaded = spawnSync(bundledNode, [probe], {
      cwd: runtime, encoding: "utf8", env: { ...process.env, NODE_PATH: "" },
      timeout: 120_000,
    });
    assert.equal(loaded.error, undefined, `Packaged runtime subprocess failed: ${loaded.error?.message}`);
    assert.equal(loaded.status, 0, loaded.stdout + loaded.stderr);
    console.log(loaded.stdout.trim());
    // A packaged release must fail closed if its shipped prebuild disappears.
    rmSync(loaded.stdout.trim());
    const { assertSqlcipherPrebuild } = await import(
      new URL("../apps/desktop/scripts/script-security-utils.mjs", import.meta.url)
    );
    assert.throws(() => assertSqlcipherPrebuild(
      join(runtime, "node_modules", "better-sqlite3-multiple-ciphers"),
    ), /Missing encrypted SQLite shipped prebuild/);
    const smoke = readFileSync(join(root, "scripts", "smoke", "installer-smoke.mjs"), "utf8");
    assert.doesNotMatch(smoke, /"better-sqlite3-multiple-ciphers",\s*"build"/);
    assert.ok(existsSync(createRequire(join(runtime, "package.json")).resolve("better-sqlite3")));
  } finally {
    rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
