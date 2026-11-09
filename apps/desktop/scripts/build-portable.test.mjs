import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { copyValidatedTree } from "./script-security-utils.mjs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));

function fixture(t, { reject = false, realProof = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-portable-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const scripts = path.join(root, "scripts");
  const release = path.join(root, "src-tauri", "target", "release");
  const portable = path.join(release, "bundle", "portable");
  const runtime = path.join(release, "bin", "api-runtime");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.join(runtime, "dist"), { recursive: true });
  mkdirSync(path.join(portable, "Tuari-portable"), { recursive: true });
  writeFileSync(path.join(release, "app.exe"), "synthetic app");
  copyFileSync(process.execPath, path.join(release, "bin", "node.exe"));
  writeFileSync(path.join(runtime, "dist", "index.cjs"), "// synthetic loader");
  writeFileSync(path.join(portable, "Tuari-portable", "previous.txt"), "previous folder");
  writeFileSync(path.join(portable, "Tuari-portable.zip"), "previous zip");
  copyFileSync(path.join(scriptsRoot, "build-portable.mjs"), path.join(scripts, "build-portable.mjs"));
  writeFileSync(path.join(scripts, "script-security-utils.mjs"), `
    import fs from 'node:fs';
    import { resolveTrustedTarPath as resolveTar } from ${JSON.stringify(new URL("./script-security-utils.mjs", import.meta.url).href)};
    export { assertSqlcipherPrebuild, copyValidatedTree, validateReleaseBinEntries } from ${JSON.stringify(new URL("./script-security-utils.mjs", import.meta.url).href)};
    export const resolveTrustedTarPath = () => {
      fs.writeFileSync(${JSON.stringify(path.join(root, "archive-called"))}, 'called');
      return resolveTar();
    };
  `);
  if (realProof) {
    for (const name of ["sqlcipher-encryption-proof.mjs", "sqlcipher-availability.mjs"]) {
      copyFileSync(path.join(scriptsRoot, name), path.join(scripts, name));
    }
  } else {
    writeFileSync(path.join(scripts, "sqlcipher-encryption-proof.mjs"), `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import path from 'node:path';
      export { parseArgs } from ${JSON.stringify(new URL("./sqlcipher-encryption-proof.mjs", import.meta.url).href)};
      export async function runProof(options) {
        const candidate = ${JSON.stringify(path.join(portable, ".tmp-Tuari-portable"))};
        assert.equal(options.runtimeDir, path.join(candidate, 'bin', 'api-runtime'));
        assert.equal(options.nodeExe, path.join(candidate, 'bin', 'node.exe'));
        assert.equal(fs.readFileSync(path.join(options.runtimeDir, 'dist', 'index.cjs'), 'utf8'), '// synthetic loader');
        assert.equal(fs.readFileSync(path.join(${JSON.stringify(portable)}, 'Tuari-portable.zip'), 'utf8'), 'previous zip');
        fs.writeFileSync(${JSON.stringify(path.join(root, "proof-called"))}, 'called');
        await new Promise(resolve => setTimeout(resolve, 10));
        ${reject ? "throw new Error('synthetic plaintext runtime rejection');" : "return { results: ['synthetic proof success'] };"}
      }
    `);
  }
  return {
    root, portable, runtime,
    run() {
      return spawnSync(process.execPath, [path.join(scripts, "build-portable.mjs")], {
        encoding: "utf8", timeout: 60_000,
        env: { ...process.env, NODE_OPTIONS: "" },
      });
    },
  };
}

test("portable:only rejects failed encryption proof before replacing outputs or archiving", (t) => {
  const f = fixture(t, { reject: true });
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /synthetic plaintext runtime rejection/);
  assert.ok(existsSync(path.join(f.root, "proof-called")));
  assert.ok(!existsSync(path.join(f.root, "archive-called")));
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable.zip"), "utf8"), "previous zip");
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable", "previous.txt"), "utf8"), "previous folder");
});

test("portable:only publishes and archives only after the copied candidate passes proof", { skip: process.platform !== "win32" }, (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(existsSync(path.join(f.root, "proof-called")));
  assert.ok(existsSync(path.join(f.root, "archive-called")));
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable.zip")).subarray(0, 2).toString(), "PK");
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable", "bin", "api-runtime", "dist", "index.cjs"), "utf8"), "// synthetic loader");
  assert.ok(!existsSync(path.join(f.portable, ".tmp-Tuari-portable")));
});

test("portable:only runs the real proof and rejects a legacy runtime missing encrypted dependencies", (t) => {
  const f = fixture(t, { realProof: true });
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing the better-sqlite3-multiple-ciphers package/);
  assert.ok(!existsSync(path.join(f.root, "archive-called")));
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable.zip"), "utf8"), "previous zip");
});

function copyNativePackages(t, runtime) {
  const apiRequire = createRequire(new URL("../../api/package.json", import.meta.url));
  try {
    let dependencyRequire = apiRequire;
    for (const name of ["better-sqlite3-multiple-ciphers", "better-sqlite3", "bindings", "file-uri-to-path"]) {
      const resolver = name.startsWith("better-sqlite3") ? apiRequire : dependencyRequire;
      const packageJson = realpathSync(resolver.resolve(`${name}/package.json`));
      copyValidatedTree(path.dirname(packageJson), path.join(runtime, "node_modules", name));
      dependencyRequire = createRequire(packageJson);
    }
  } catch (error) {
    assert.ok(!process.env.CI, `CI requires native packaging dependencies: ${error.message}`);
    t.skip(`Native packaging dependencies unavailable: ${error.message}`);
    return false;
  }
  return true;
}

for (const mode of ["plaintext binding", "plaintext loader"]) {
  test(`portable:only rejects an actual ${mode} through the real encryption proof`, (t) => {
    const f = fixture(t, { realProof: true });
    if (!copyNativePackages(t, f.runtime)) return;
    if (mode === "plaintext binding") {
      // Model the old fallback: plain SQLite accepts but ignores encryption PRAGMAs.
      const encrypted = path.join(f.runtime, "node_modules", "better-sqlite3-multiple-ciphers");
      writeFileSync(path.join(encrypted, "package.json"), JSON.stringify({ main: "plain.cjs" }));
      writeFileSync(path.join(encrypted, "plain.cjs"), "module.exports = require('better-sqlite3');");
    } else {
      // An encrypted binding is present, but the stale loader discards the keyed
      // database and opens a plain one. The probe must execute the actual loader.
      writeFileSync(path.join(f.runtime, "dist", "index.cjs"), `
        const fs = require('node:fs');
        const Database = require('better-sqlite3');
        fs.rmSync(process.env.APP_DB_PATH, { force: true });
        const db = new Database(process.env.APP_DB_PATH);
        db.exec('CREATE TABLE plaintext (v TEXT)');
        require('node:http').createServer((req, res) => {
          res.writeHead(200); res.end('ok');
        }).listen(Number(process.env.API_PORT), process.env.API_HOST);
      `);
    }
    const result = f.run();
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, mode === "plaintext binding"
      ? /keyed write: .*PLAINTEXT database/
      : /sidecar database: .*PLAINTEXT database/);
    assert.ok(!existsSync(path.join(f.root, "archive-called")));
    assert.equal(readFileSync(path.join(f.portable, "Tuari-portable.zip"), "utf8"), "previous zip");
    assert.equal(readFileSync(path.join(f.portable, "Tuari-portable", "previous.txt"), "utf8"), "previous folder");
  });
}
