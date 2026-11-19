import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { copyValidatedTree } from "./script-security-utils.mjs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renamePortableCandidate } from "./portable-rename.mjs";
import { createPortableRenameDiagnostics, reportPortableRenameDiagnosticFailure } from "./portable-rename-diagnostics.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));

const ownedChildren = new WeakMap();

function registerChild(t, child) {
  const children = ownedChildren.get(t) ?? new Set();
  ownedChildren.set(t, children);
  let closed = false;
  const done = new Promise(resolve => {
    child.once("error", () => {}); // close still follows a failed spawn.
    child.once("close", (status, signal) => {
      closed = true;
      resolve({ status, signal });
    });
  });
  const stop = async () => {
    if (!closed && child.pid) child.kill("SIGKILL");
    let timer;
    try {
      await Promise.race([
        done,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Owned child ${child.pid} did not close within 5000ms`)), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  children.add(stop);
  t.after(stop);
  return { done, stop };
}

async function stopOwnedChildren(t) {
  const results = await Promise.allSettled([...(ownedChildren.get(t) ?? [])].map(stop => stop()));
  const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, "Owned children did not stop; fixture files retained");
}

async function startDirectoryLock(t, directory, { startupTimeoutMs = 10_000 } = {}) {
  const script = path.join(os.tmpdir(), `tuari-dir-lock-${process.pid}-${Date.now()}.ps1`);
  writeFileSync(script, `
    Add-Type -TypeDefinition @'
    using System;
    using System.Runtime.InteropServices;
    public static class DirectoryLock {
      [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
      public static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
      [DllImport("kernel32.dll", SetLastError = true)]
      public static extern bool CloseHandle(IntPtr handle);
    }
'@
    $handle = [DirectoryLock]::CreateFile($args[0], 0x10000, 0x3, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
    if ($handle -eq [IntPtr]::new(-1)) { throw "CreateFile failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
    Write-Output "LOCKED pid=$PID path=$($args[0]) shareDelete=false"
    [Console]::In.ReadLine() | Out-Null
    [void][DirectoryLock]::CloseHandle($handle)
    Write-Output "RELEASED pid=$PID"
  `);
  t.after(async () => {
    await stopOwnedChildren(t);
    rmSync(script, { force: true });
  });
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, directory], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const owned = registerChild(t, child);
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });
  const deadline = Date.now() + startupTimeoutMs;
  while (!output.includes("LOCKED") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.match(output, /LOCKED pid=\d+ .*shareDelete=false/, `Directory lock did not start: ${output}`);
  let released = false;
  return {
    child,
    output: () => output,
    release() {
      if (released) return;
      released = true;
      if (child.exitCode === null && child.signalCode === null && !child.stdin.destroyed) child.stdin.end("release\n");
    },
    done: owned.done,
  };
}

function fixture(t, { reject = false, realProof = false, proofBarrier = false, diagnostics = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-portable-test-"));
  t.after(async () => {
    await stopOwnedChildren(t);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const scripts = path.join(root, "scripts");
  const release = path.join(root, "src-tauri", "target", "release");
  const portable = path.join(release, "bundle", "portable");
  // build-sidecar stages Tauri bundle resources outside target/release.
  const bin = path.join(root, "src-tauri", "bin");
  const runtime = path.join(bin, "api-runtime");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.join(runtime, "dist"), { recursive: true });
  mkdirSync(path.join(portable, "Tuari-portable"), { recursive: true });
  mkdirSync(path.join(release, "resources"), { recursive: true });
  writeFileSync(path.join(release, "resources", "required.dat"), "required resource");
  writeFileSync(path.join(release, "app.exe"), "synthetic app");
  copyFileSync(process.execPath, path.join(bin, "node.exe"));
  writeFileSync(path.join(runtime, "dist", "index.cjs"), "// synthetic loader");
  writeFileSync(path.join(portable, "Tuari-portable", "previous.txt"), "previous folder");
  writeFileSync(path.join(portable, "Tuari-portable.zip"), "previous zip");
  copyFileSync(path.join(scriptsRoot, "build-portable.mjs"), path.join(scripts, "build-portable.mjs"));
  copyFileSync(path.join(scriptsRoot, "portable-proof-process.mjs"), path.join(scripts, "portable-proof-process.mjs"));
  copyFileSync(path.join(scriptsRoot, "portable-rename.mjs"), path.join(scripts, "portable-rename.mjs"));
  copyFileSync(path.join(scriptsRoot, "portable-rename-diagnostics.mjs"), path.join(scripts, "portable-rename-diagnostics.mjs"));
  copyFileSync(path.join(scriptsRoot, "portable-rename-diagnostics.ps1"), path.join(scripts, "portable-rename-diagnostics.ps1"));
  const diagnosticsDir = diagnostics ? path.join(root, "portable-lock-diagnostics") : undefined;
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
      import { pathToFileURL } from 'node:url';
      async function main() {
        const args = process.argv.slice(2);
        const runtimeDir = args[args.indexOf('--runtime') + 1];
        const nodeExe = args[args.indexOf('--node') + 1];
        const candidate = ${JSON.stringify(path.join(portable, ".tmp-Tuari-portable"))};
        assert.equal(runtimeDir, path.join(candidate, 'bin', 'api-runtime'));
        assert.equal(nodeExe, path.join(candidate, 'bin', 'node.exe'));
        assert.equal(fs.readFileSync(path.join(runtimeDir, 'dist', 'index.cjs'), 'utf8'), '// synthetic loader');
        assert.equal(fs.readFileSync(path.join(${JSON.stringify(portable)}, 'Tuari-portable.zip'), 'utf8'), 'previous zip');
        fs.writeFileSync(${JSON.stringify(path.join(root, "proof-called"))}, String(process.pid));
        ${proofBarrier ? `
          fs.writeFileSync(${JSON.stringify(path.join(root, "proof-ready"))}, runtimeDir);
          while (!fs.existsSync(${JSON.stringify(path.join(root, "proof-continue"))})) await new Promise(resolve => setTimeout(resolve, 10));
        ` : "await new Promise(resolve => setTimeout(resolve, 10));"}
        ${reject ? "throw new Error('synthetic plaintext runtime rejection');" : "return { results: ['synthetic proof success'] };"}
      }
      if (import.meta.url === pathToFileURL(process.argv[1]).href) main().then(() => {}, error => { console.error(error); process.exitCode = 1; });
    `);
  }
  return {
    root, portable, runtime, diagnosticsDir,
    run() {
      return spawnSync(process.execPath, [path.join(scripts, "build-portable.mjs")], {
        encoding: "utf8", timeout: 60_000,
        env: { ...process.env, NODE_OPTIONS: "", ...(diagnosticsDir ? { TUARI_PORTABLE_DIAGNOSTICS_DIR: diagnosticsDir } : {}) },
      });
    },
    start() {
      const child = spawn(process.execPath, [path.join(scripts, "build-portable.mjs")], {
        env: { ...process.env, NODE_OPTIONS: "", ...(diagnosticsDir ? { TUARI_PORTABLE_DIAGNOSTICS_DIR: diagnosticsDir } : {}) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const owned = registerChild(t, child);
      let output = "";
      const waitFor = async (pattern) => {
        const deadline = Date.now() + 10_000;
        while (!pattern.test(output) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        assert.match(output, pattern, `Timed out waiting for ${pattern}; output was: ${output}`);
      };
      child.stdout.on("data", chunk => { output += chunk.toString(); });
      child.stderr.on("data", chunk => { output += chunk.toString(); });
      const done = owned.done.then(result => ({ ...result, output }));
      return { child, waitFor, done, get output() { return output; } };
    },
  };
}

test("portable:only closes a separate proof process before publishing the verified candidate", async (t) => {
  const f = fixture(t, { proofBarrier: true });
  const run = f.start();
  const readyPath = path.join(f.root, "proof-ready");
  const deadline = Date.now() + 10_000;
  while (!existsSync(readyPath) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(readyPath), "proof must run in its own process before publication");
  const proofPid = Number(readFileSync(path.join(f.root, "proof-called"), "utf8"));
  assert.notEqual(proofPid, run.child.pid, "native proof process must not be the packaging process");
  writeFileSync(path.join(f.root, "proof-continue"), "continue");
  const result = await run.done;
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, new RegExp(`\\[portable-proof\\] completed pid=${proofPid} status=0; process closed before candidate publication`));
  assert.ok(result.output.indexOf("process closed before candidate publication") < result.output.indexOf("Portable folder ready"));
  assert.ok(existsSync(path.join(f.root, "archive-called")));
  assert.ok(existsSync(path.join(f.portable, "Tuari-portable")));
});

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

test("portable:only creates a Windows Explorer-visible ZIP with root app, runtime and resources", { skip: process.platform !== "win32" }, (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(existsSync(path.join(f.root, "proof-called")));
  assert.ok(existsSync(path.join(f.root, "archive-called")));
  const archive = path.join(f.portable, "Tuari-portable.zip");
  assert.equal(readFileSync(archive).subarray(0, 2).toString(), "PK");
  const trustedTar = path.join(process.env.SystemRoot ?? process.env.windir, "System32", "tar.exe");
  const entries = spawnSync(trustedTar, ["-tf", archive], { encoding: "utf8" });
  assert.equal(entries.status, 0, entries.stderr);
  const names = entries.stdout.trim().split(/\r?\n/);
  assert.ok(names.includes("Tuari.exe"), `root executable missing from ZIP: ${names.join(", ")}`);
  assert.ok(names.includes("bin/node.exe"), `runtime missing from ZIP: ${names.join(", ")}`);
  assert.ok(names.includes("resources/required.dat"), `resource missing from ZIP: ${names.join(", ")}`);
  assert.ok(names.every(name => !name.startsWith("./") && !name.includes("\\")), `ZIP paths must be relative and use forward slashes: ${names.join(", ")}`);
  const extracted = path.join(f.root, "extracted");
  mkdirSync(extracted);
  const extraction = spawnSync(trustedTar, ["-xf", archive, "-C", extracted], { encoding: "utf8" });
  assert.equal(extraction.status, 0, extraction.stderr);
  assert.equal(readFileSync(path.join(extracted, "Tuari.exe"), "utf8"), "synthetic app");
  assert.equal(readFileSync(path.join(extracted, "bin", "api-runtime", "dist", "index.cjs"), "utf8"), "// synthetic loader");
  assert.equal(readFileSync(path.join(extracted, "resources", "required.dat"), "utf8"), "required resource");
  const shellCheck = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.resolve(scriptsRoot, "../../../scripts/smoke/check-portable-zip-shell.ps1"), archive], { encoding: "utf8" });
  assert.equal(shellCheck.status, 0, shellCheck.stdout + shellCheck.stderr);
  assert.match(shellCheck.stdout, /Windows Shell ZIP entries .*Tuari\.exe.*bin.*resources/);
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable", "bin", "api-runtime", "dist", "index.cjs"), "utf8"), "// synthetic loader");
  assert.ok(!existsSync(path.join(f.portable, ".tmp-Tuari-portable")));
});

test("Windows Shell identity ignores hidden extensions and display labels", { skip: process.platform !== "win32" }, () => {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.resolve(scriptsRoot, "../../../scripts/smoke/portable-shell-entry-names.test.ps1")], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /PASS hidden-extension/);
  assert.match(result.stdout, /PASS executable display label cannot disguise/);
});

test("portable:only retries the production candidate rename after a held Win32 directory handle releases", { skip: process.platform !== "win32" }, async (t) => {
  const f = fixture(t, { proofBarrier: true });
  const run = f.start();
  const readyPath = path.join(f.root, "proof-ready");
  const deadline = Date.now() + 10_000;
  while (!existsSync(readyPath) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(readyPath), "build did not finish copying the candidate into the proof step");
  const candidate = path.resolve(readFileSync(readyPath, "utf8"), "..", "..");
  const lock = await startDirectoryLock(t, candidate);
  t.after(() => lock.release());
  writeFileSync(path.join(f.root, "proof-continue"), "continue");
  await run.waitFor(/portable-rename] attempt 1\/4 failed \((EPERM|EBUSY|EACCES):/);
  lock.release();
  await lock.done;
  const result = await run.done;
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /portable-rename] attempt 1\/4 failed \((EPERM|EBUSY|EACCES):/);
  assert.match(lock.output(), /LOCKED pid=\d+ .*shareDelete=false/);
  assert.ok(existsSync(path.join(f.root, "archive-called")));
  assert.ok(existsSync(path.join(f.portable, "Tuari-portable")));
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable.zip")).subarray(0, 2).toString(), "PK");
});

test("portable:only records the real failed rename and keeps the previous archive under a held Win32 directory handle", { skip: process.platform !== "win32" }, async (t) => {
  const f = fixture(t, { proofBarrier: true, diagnostics: true });
  const run = f.start();
  const readyPath = path.join(f.root, "proof-ready");
  const deadline = Date.now() + 10_000;
  while (!existsSync(readyPath) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(readyPath), "build did not finish copying the candidate into the proof step");
  const candidate = path.resolve(readFileSync(readyPath, "utf8"), "..", "..");
  const lock = await startDirectoryLock(t, candidate);
  t.after(() => lock.release());
  writeFileSync(path.join(f.root, "proof-continue"), "continue");
  const result = await run.done;
  lock.release();
  await lock.done;
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /portable-rename] attempt 4\/4 failed without retry \((EPERM|EBUSY|EACCES):/);
  assert.ok(!existsSync(path.join(f.root, "archive-called")));
  assert.equal(readFileSync(path.join(f.portable, "Tuari-portable.zip"), "utf8"), "previous zip");
  assert.ok(existsSync(path.join(f.portable, ".tmp-Tuari-portable")), "failed candidate must remain for diagnosis");
  const reportPath = path.join(f.diagnosticsDir, "portable-rename-failure.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(report.event, "portable-candidate-rename-failed");
  assert.equal(report.process.pid, run.child.pid);
  assert.equal(report.source, path.join(f.portable, ".tmp-Tuari-portable"));
  assert.equal(report.destination, path.join(f.portable, "Tuari-portable"));
  assert.match(report.nativeError.code, /^(EPERM|EBUSY|EACCES)$/);
  assert.equal(report.nativeError.syscall, "rename");
  assert.equal(report.beforeProof.paths.find(item => item.path === report.source).exists, true);
  assert.equal(report.afterProofBeforeRename.paths.find(item => item.path === report.destination).exists, false);
  assert.ok(["no-owners-reported", "partial", "probe-error", "queried"].includes(report.immediateFailureSnapshot.restartManager.status));
  assert.match(JSON.stringify(report.immediateFailureSnapshot.restartManager.limitations), /does not prove no directory handle/);
  assert.ok(report.immediateFailureSnapshot.restartManager.directoryResourcesNotQueried.includes(report.source));
});

for (const code of ["EACCES", "EBUSY", "EPERM"]) {
  test(`portable rename recovers from temporary ${code} on every platform`, async () => {
    let attempts = 0;
    const waits = [];
    await renamePortableCandidate("source", "destination", {
      move: async () => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error("temporary lock"), { code });
      },
      pause: async milliseconds => { waits.push(milliseconds); },
      log: () => {},
    });
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [100, 250]);
  });

  test(`portable rename exhausts four ${code} attempts on every platform`, async () => {
    let attempts = 0;
    const waits = [];
    const failure = Object.assign(new Error("persistent lock"), { code });
    await assert.rejects(renamePortableCandidate("source", "destination", {
      move: async () => { attempts += 1; throw failure; },
      pause: async milliseconds => { waits.push(milliseconds); },
      log: () => {},
    }), error => error === failure);
    assert.equal(attempts, 4);
    assert.deepEqual(waits, [100, 250, 500]);
  });
}

test("failed setup stops a blocked build before deleting its fixture", async () => {
  const hooks = [];
  const scope = { after: hook => hooks.push(hook) };
  const f = fixture(scope, { proofBarrier: true });
  const run = f.start();
  try {
    const deadline = Date.now() + 10_000;
    while (!existsSync(path.join(f.root, "proof-ready")) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(existsSync(path.join(f.root, "proof-ready")), "build must actually be blocked in proof before cleanup");
    // Run failure hooks without writing proof-continue, as a failed lock setup does.
    for (const hook of hooks) await hook();
    assert.ok(run.child.exitCode !== null || run.child.signalCode !== null);
    assert.ok(!existsSync(f.root), "fixture removed only after the owned child closes");
  } finally {
    await stopOwnedChildren(scope);
    if (existsSync(f.root)) rmSync(f.root, { recursive: true, force: true });
  }
});

test("lock startup timeout cleans both children before deleting fixture files", { skip: process.platform !== "win32" }, async () => {
  const hooks = [];
  const scope = { after: hook => hooks.push(hook) };
  const f = fixture(scope, { proofBarrier: true });
  const run = f.start();
  try {
    const deadline = Date.now() + 10_000;
    while (!existsSync(path.join(f.root, "proof-ready")) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(existsSync(path.join(f.root, "proof-ready")));
    await assert.rejects(startDirectoryLock(scope, path.join(f.root, "absent"), { startupTimeoutMs: 1 }), /Directory lock did not start/);
    assert.equal(ownedChildren.get(scope).size, 2, "both spawns registered before lock startup assertion");
    for (const hook of hooks) await hook();
    assert.ok(run.child.exitCode !== null || run.child.signalCode !== null);
    assert.ok(!existsSync(f.root));
  } finally {
    await stopOwnedChildren(scope);
    if (existsSync(f.root)) rmSync(f.root, { recursive: true, force: true });
  }
});

test("a failed diagnostic write cannot replace the primary native rename exception", () => {
  const primary = Object.assign(new Error("EPERM rename source -> destination"), { code: "EPERM" });
  const logs = [];
  assert.doesNotThrow(() => reportPortableRenameDiagnosticFailure(primary, {
    recordFailure() { throw new Error("diagnostic probe denied"); },
  }, line => logs.push(line)));
  assert.equal(primary.code, "EPERM");
  assert.match(logs[0], /diagnostic probe denied; primary rename error preserved/);
});

test("portable candidate rename retries only recognized transient Windows errors", async () => {
  let moves = 0;
  let pauses = 0;
  const logs = [];
  await assert.rejects(renamePortableCandidate("source", "destination", {
    move: async () => {
      moves += 1;
      const error = new Error("source disappeared");
      error.code = "ENOENT";
      throw error;
    },
    pause: async () => { pauses += 1; },
    log: line => logs.push(line),
  }), { code: "ENOENT" });
  assert.equal(moves, 1);
  assert.equal(pauses, 0);
  assert.match(logs[0], /failed without retry \(ENOENT:/);
});

test("portable candidate rename reproduces a real Win32 directory-handle lock", { skip: process.platform !== "win32" }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-rename-lock-proof-"));
  t.after(async () => {
    await stopOwnedChildren(t);
    rmSync(root, { recursive: true, force: true });
  });
  const source = path.join(root, "candidate");
  const destination = path.join(root, "published");
  mkdirSync(source);
  writeFileSync(path.join(source, "payload.txt"), "candidate");

  console.log(`[win32-directory-lock] start=${new Date().toISOString()} source=${source} destination=${destination}`);
  await renamePortableCandidate(source, destination, { log: () => {} });
  assert.ok(existsSync(destination), "baseline rename to absent destination must succeed without a handle");
  console.log(`[win32-directory-lock] baseline=success at=${new Date().toISOString()} destinationAbsentBefore=true`);
  renameSync(destination, source);

  const lock = await startDirectoryLock(t, source);
  t.after(() => lock.release());
  console.log(`[win32-directory-lock] ${lock.output().trim()} at=${new Date().toISOString()}`);
  const attempts = [];
  await assert.rejects(renamePortableCandidate(source, destination, {
    log: line => attempts.push(line),
  }), error => {
    assert.ok(["EPERM", "EBUSY", "EACCES"].includes(error.code), `unexpected native rename error: ${JSON.stringify({ code: error.code, errno: error.errno, syscall: error.syscall, path: error.path, dest: error.dest })}`);
    console.log(`[win32-directory-lock] red pid=${lock.output().match(/pid=(\d+)/)?.[1]} code=${error.code} errno=${error.errno} syscall=${error.syscall} path=${error.path} dest=${error.dest}`);
    return true;
  });
  assert.equal(attempts.length, 4);
  assert.ok(attempts.every(line => /EPERM|EBUSY|EACCES/.test(line)), attempts.join("\n"));
  for (const attempt of attempts) console.log(`[win32-directory-lock] ${attempt}`);
  lock.release();
  await lock.done;
  console.log(`[win32-directory-lock] released pid=${lock.output().match(/pid=(\d+)/)?.[1]} at=${new Date().toISOString()}`);
  await renamePortableCandidate(source, destination, { log: line => console.log(`[win32-directory-lock] green ${line}`) });
  assert.ok(existsSync(destination), "rename must succeed after the exact owned lock process closes its handle");
  console.log(`[win32-directory-lock] green=success at=${new Date().toISOString()} destinationExists=true`);
});

test("Restart Manager reports its honest result for a known owned packaged-file lock", { skip: process.platform !== "win32" }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-rm-file-lock-"));
  t.after(async () => {
    await stopOwnedChildren(t);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const candidate = path.join(root, "candidate");
  const final = path.join(root, "published");
  const executable = path.join(candidate, "Tuari.exe");
  const diagnosticsDir = path.join(root, "diagnostics");
  mkdirSync(candidate);
  writeFileSync(executable, "fixture executable");
  const prebuild = path.join(candidate, "bin", "api-runtime", "node_modules", "better-sqlite3-multiple-ciphers", "prebuilds", "win32-x64.node");
  mkdirSync(path.dirname(prebuild), { recursive: true });
  writeFileSync(prebuild, "synthetic prebuild resource, not loaded");
  const lockScript = path.join(root, "file-lock.ps1");
  writeFileSync(lockScript, `
    Add-Type -TypeDefinition @'
    using System;
    using System.Runtime.InteropServices;
    public static class FileLockFixture {
      [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
      public static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
      [DllImport("kernel32.dll", SetLastError = true)]
      public static extern bool CloseHandle(IntPtr handle);
    }
'@
    $handle = [FileLockFixture]::CreateFile($args[0], 0x80000000, 0x3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
    if ($handle -eq [IntPtr]::new(-1)) { throw "CreateFile failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
    Write-Output "LOCKED pid=$PID path=$($args[0]) shareDelete=false"
    [Console]::In.ReadLine() | Out-Null
    [void][FileLockFixture]::CloseHandle($handle)
  `);
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", lockScript, executable], { stdio: ["pipe", "pipe", "pipe"] });
  const owned = registerChild(t, child);
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });
  const deadline = Date.now() + 10_000;
  while (!output.includes("LOCKED") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.match(output, /LOCKED pid=(\d+)/, `file holder did not start: ${output}`);
  const holderPid = Number(output.match(/LOCKED pid=(\d+)/)[1]);

  const diagnostics = createPortableRenameDiagnostics(candidate, final, { directory: diagnosticsDir });
  diagnostics.updateFinal(final);
  diagnostics.beforeRename();
  const error = Object.assign(new Error(`EPERM: rename '${candidate}' -> '${final}'`), {
    code: "EPERM", errno: -4048, syscall: "rename", path: candidate, dest: final,
  });
  const reportPath = diagnostics.recordFailure(error);
  assert.ok(reportPath);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(report.process.sourceSha?.length, 40);
  const manager = report.immediateFailureSnapshot.restartManager;
  assert.ok(["queried", "no-owners-reported"].includes(manager.status), JSON.stringify(manager));
  assert.deepEqual(manager.errors, []);
  if (manager.owners.some(owner => owner.pid === holderPid)) {
    assert.ok(manager.owners.some(owner => owner.pid === holderPid && owner.resource === executable));
  } else {
    assert.ok(manager.limitations.some(limit => limit.includes("empty file-owner list does not prove")));
  }
  assert.ok(report.immediateFailureSnapshot.resources.some(resource => resource.path === prebuild && resource.exists), "selected native prebuild file is captured, not an imaginary directory");
  assert.ok(report.immediateFailureSnapshot.resources.some(resource => resource.path === executable && resource.exists), "the exact locked file was registered as a resource");
  child.stdin.end("release\n");
  await owned.stop();
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
