import test from "node:test";
import assert from "node:assert/strict";
import {
  SQLCIPHER_PROBE_SOURCE,
  SQLCIPHER_PROBE_TIMEOUT_MS,
  probeSqlcipherBinding,
} from "./sqlcipher-availability.mjs";

test("the bundled-Node probe selects SQLCipher and legacy mode before the key", () => {
  const cipher = SQLCIPHER_PROBE_SOURCE.indexOf('db.pragma("cipher = \'sqlcipher\'")');
  const legacy = SQLCIPHER_PROBE_SOURCE.indexOf('db.pragma("legacy = 4")');
  const key = SQLCIPHER_PROBE_SOURCE.indexOf('db.pragma("key = ');
  assert.ok(cipher >= 0 && cipher < legacy && legacy < key);
  assert.match(SQLCIPHER_PROBE_SOURCE, /cipher_version/);
});

test("probeSqlcipherBinding runs the bundled Node with the runtime as cwd", () => {
  const calls = [];
  const version = probeSqlcipherBinding({
    nodeExecPath: "C:/bundle/node.exe",
    runtimeDir: "C:/bundle/api-runtime",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "4.5.6 community\n";
    },
  });

  assert.equal(version, "4.5.6 community");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "C:/bundle/node.exe");
  assert.deepEqual(calls[0].args, ["-e", SQLCIPHER_PROBE_SOURCE]);
  assert.equal(calls[0].options.cwd, "C:/bundle/api-runtime");
  assert.equal(calls[0].options.encoding, "utf8");
  assert.equal(calls[0].options.timeout, SQLCIPHER_PROBE_TIMEOUT_MS);
});

test("probeSqlcipherBinding reports loader failures and rejects an empty version", () => {
  const failure = new Error("process failed");
  failure.stderr = "compiled against a different Node.js version";
  assert.throws(() => probeSqlcipherBinding({
    nodeExecPath: "node.exe", runtimeDir: "C:/runtime", execFile: () => { throw failure; },
  }), /compiled against a different Node\.js version/);

  assert.throws(() => probeSqlcipherBinding({
    nodeExecPath: "node.exe", runtimeDir: "C:/runtime", execFile: () => "  \n",
  }), /reported no cipher_version/);
});
