import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildProbeAndPublishRuntime } from "./runtime-staging.mjs";

/** Hash every file in a tree so "byte-for-byte intact" is a single compare. */
const hashTree = (dir) => {
  const hash = createHash("sha256");

  const walk = (currentDir, relativeDir) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}\n`);
        walk(absolutePath, relativePath);
        continue;
      }

      hash.update(`file:${relativePath}:${readFileSync(absolutePath, "utf8")}\n`);
    }
  };

  walk(dir, "");
  return hash.digest("hex");
};

const writeTree = (root, files) => {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
};

/** A destination with a "previous working runtime" plus a fresh staging tree. */
const withLayout = (run) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tuari-runtime-staging-"));
  const destinationDir = path.join(root, "src-tauri", "bin");
  const stagingDir = path.join(root, "src-tauri", ".bin-staging");

  writeTree(destinationDir, {
    "marker.txt": "previous-working-runtime",
    [path.join("api-runtime", "package.json")]: '{"name":"previous"}',
  });
  writeTree(stagingDir, {
    "node.exe": "staged-node",
    [path.join("api-runtime", "package.json")]: '{"name":"staged"}',
  });

  try {
    return run({ root, destinationDir, stagingDir, previousHash: hashTree(destinationDir) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("a successful probe publishes the staged runtime and removes the staging tree", () => {
  withLayout(({ root, destinationDir, stagingDir }) => {
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
    });

    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    assert.equal(
      readFileSync(path.join(destinationDir, "api-runtime", "package.json"), "utf8"),
      '{"name":"staged"}',
    );
    // The staged tree was renamed, not copied, so it is gone from the sibling.
    assert.equal(readdirSync(path.join(root, "src-tauri")).some((name) => name.startsWith(".bin-staging")), false);
    assert.equal(
      readdirSync(path.join(root, "src-tauri")).some((name) => name.includes(".previous-")),
      false,
    );
  });
});

test("a failed probe leaves the previous runtime byte-for-byte intact", () => {
  withLayout(({ root, destinationDir, stagingDir, previousHash }) => {
    assert.throws(
      () => buildProbeAndPublishRuntime({
        stagingDir,
        destinationDir,
        build: () => {},
        probe: () => {
          throw new Error("SQLCipher binding could not be loaded by node.exe: ERR_DLOPEN_FAILED");
        },
      }),
      /could not be loaded/,
    );

    // This is the #409 finding: the old runtime must survive a rejected build.
    assert.equal(hashTree(destinationDir), previousHash);
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "previous-working-runtime");
    // The staged runtime never leaked into the destination.
    assert.equal(readdirSync(destinationDir).includes("node.exe"), false);
    // And the staging tree was cleaned up.
    assert.equal(readdirSync(path.join(root, "src-tauri")).some((name) => name.startsWith(".bin-staging")), false);
  });
});

test("a failed build never reaches the probe and leaves the previous runtime intact", () => {
  withLayout(({ destinationDir, stagingDir, previousHash }) => {
    let probeCalls = 0;

    assert.throws(
      () => buildProbeAndPublishRuntime({
        stagingDir,
        destinationDir,
        build: () => {
          throw new Error("node-gyp rebuild failed");
        },
        probe: () => {
          probeCalls += 1;
        },
      }),
      /node-gyp rebuild failed/,
    );

    assert.equal(probeCalls, 0);
    assert.equal(hashTree(destinationDir), previousHash);
  });
});

test("a failure while swapping in the staged tree restores the previous runtime", () => {
  withLayout(({ destinationDir, stagingDir, previousHash }) => {
    let renameCalls = 0;
    const rename = (from, to) => {
      renameCalls += 1;
      // 1: destination aside. 2: staging into place (fails). 3: restore.
      if (renameCalls === 2) {
        throw new Error("EBUSY: resource busy or locked, rename");
      }
      renameSync(from, to);
    };

    assert.throws(
      () => buildProbeAndPublishRuntime({
        stagingDir,
        destinationDir,
        build: () => {},
        probe: () => {},
        rename,
      }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 3);
    assert.equal(hashTree(destinationDir), previousHash);
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "previous-working-runtime");
  });
});

test("an ephemeral build probes and discards without touching the destination", () => {
  withLayout(({ root, destinationDir, stagingDir, previousHash }) => {
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      publish: false,
    });

    assert.equal(hashTree(destinationDir), previousHash);
    assert.equal(readdirSync(path.join(root, "src-tauri")).some((name) => name.startsWith(".bin-staging")), false);
  });
});

test("a backup directory left by a crashed run is cleared before the next swap", () => {
  withLayout(({ root, destinationDir, stagingDir }) => {
    const staleBackup = `${destinationDir}.previous-${process.pid}`;
    writeTree(staleBackup, { "junk.txt": "half-copied tree from a crashed run" });

    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
    });

    assert.equal(readdirSync(path.join(root, "src-tauri")).some((name) => name.includes(".previous-")), false);
    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
  });
});
