import test from "node:test";
import assert from "node:assert/strict";
import {
  SQLCIPHER_PROBE_SOURCE,
  SQLCIPHER_PROBE_TIMEOUT_MS,
  probeSqlcipherBinding,
} from "./sqlcipher-availability.mjs";

test("the bundled-Node availability probe proves a keyed temporary-file roundtrip", () => {
  assert.ok(!SQLCIPHER_PROBE_SOURCE.includes("cipher_version"));
  assert.ok(SQLCIPHER_PROBE_SOURCE.includes("mkdtempSync"));
  assert.ok(SQLCIPHER_PROBE_SOURCE.includes("new Database(probeFile)"));
  assert.ok(SQLCIPHER_PROBE_SOURCE.includes("CREATE TABLE probe"));
  assert.ok(SQLCIPHER_PROBE_SOURCE.includes("SELECT value FROM probe"));
  assert.ok(SQLCIPHER_PROBE_SOURCE.includes("fs.rmSync(probeDir, { recursive: true, force: true })"));
});

test("probeSqlcipherBinding runs bundled Node from the runtime and requires its behavioral success", () => {
  const calls = [];
  const result = probeSqlcipherBinding({
    nodeExecPath: "C:/bundle/node.exe",
    runtimeDir: "C:/bundle/api-runtime",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "keyed temporary-file readback passed\n";
    },
  });

  assert.equal(result, "keyed temporary-file readback passed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "C:/bundle/node.exe");
  assert.deepEqual(calls[0].args, ["-e", SQLCIPHER_PROBE_SOURCE]);
  assert.equal(calls[0].options.cwd, "C:/bundle/api-runtime");
  assert.equal(calls[0].options.encoding, "utf8");
  assert.equal(calls[0].options.timeout, SQLCIPHER_PROBE_TIMEOUT_MS);
  assert.throws(() => probeSqlcipherBinding({
    nodeExecPath: "node.exe", runtimeDir: "C:/runtime", execFile: () => "",
  }), /did not confirm its keyed file roundtrip/);
});

test("probeSqlcipherBinding reports bundled runtime execution failures", () => {
  const failure = new Error("process failed");
  failure.stderr = "compiled against a different Node.js version";
  assert.throws(() => probeSqlcipherBinding({
    nodeExecPath: "node.exe", runtimeDir: "C:/runtime", execFile: () => { throw failure; },
  }), /compiled against a different Node\.js version/);
});
