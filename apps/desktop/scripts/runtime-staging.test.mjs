import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

test("a failed cleanup after publication warns instead of failing the build", () => {
  withLayout(({ root, destinationDir, stagingDir }) => {
    const backupDir = `${destinationDir}.previous-${process.pid}`;
    const warnings = [];
    let removeCalls = 0;
    const remove = (target, options) => {
      removeCalls += 1;
      // 1: clear a stale backup before the swap. 2: the post-publication
      // cleanup of the previous runtime, which is the failing call here.
      // 3: the caller's staging-tree cleanup.
      if (removeCalls === 2) {
        throw new Error("EBUSY: resource busy or locked, rm");
      }
      rmSync(target, options);
    };

    assert.doesNotThrow(() =>
      buildProbeAndPublishRuntime({
        stagingDir,
        destinationDir,
        build: () => {},
        probe: () => {},
        remove,
        warn: (message) => warnings.push(message),
      }),
    );

    // The staged runtime is live: that is what a zero exit now means.
    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    // The old runtime could not be removed, so it is still on disk...
    assert.equal(
      readFileSync(path.join(backupDir, "marker.txt"), "utf8"),
      "previous-working-runtime",
    );
    // ...and one warning names both states, so the outcome cannot be misread.
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes(destinationDir));
    assert.ok(warnings[0].includes(backupDir));
    assert.match(warnings[0], /runtime WAS replaced/i);
    assert.match(warnings[0], /cleanup-only/i);
    assert.equal(
      readdirSync(path.join(root, "src-tauri")).some((name) => name.startsWith(".bin-staging")),
      false,
    );
  });
});

test("a failure clearing a stale backup before the swap still fails the build", () => {
  withLayout(({ destinationDir, stagingDir, previousHash }) => {
    let removeCalls = 0;
    const remove = (target, options) => {
      removeCalls += 1;
      // Nothing has been published yet, so this must stay fatal.
      if (removeCalls === 1) {
        throw new Error("EPERM: operation not permitted, rm");
      }
      rmSync(target, options);
    };

    assert.throws(
      () =>
        buildProbeAndPublishRuntime({
          stagingDir,
          destinationDir,
          build: () => {},
          probe: () => {},
          remove,
          warn: () => assert.fail("a pre-publication failure must not warn"),
        }),
      /EPERM/,
    );

    // The previous runtime is still the live one and was never renamed aside.
    assert.equal(hashTree(destinationDir), previousHash);
  });
});

test("a runtime left aside by an interrupted run is restored before the next swap", () => {
  withLayout(({ root, destinationDir, stagingDir }) => {
    const strandedBackup = `${destinationDir}.previous-999999`;
    rmSync(destinationDir, { recursive: true, force: true });
    writeTree(strandedBackup, { "marker.txt": "runtime from the interrupted run" });

    const logs = [];
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      log: (message) => logs.push(message),
    });

    // The staged runtime is live and the interrupted run's tree was consumed.
    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    assert.equal(existsSync(strandedBackup), false);
    assert.equal(
      readdirSync(path.join(root, "src-tauri")).some((name) => name.includes(".previous-")),
      false,
    );
    // The recovery says which state it found and what it did.
    assert.equal(logs.length, 1);
    assert.ok(logs[0].includes(strandedBackup));
    assert.ok(logs[0].includes(destinationDir));
    assert.match(logs[0], /Restoring/);
  });
});

test("a failed publish after recovery leaves the interrupted run's runtime in place", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    const strandedBackup = `${destinationDir}.previous-999999`;
    rmSync(destinationDir, { recursive: true, force: true });
    writeTree(strandedBackup, { "marker.txt": "runtime from the interrupted run" });
    const strandedHash = hashTree(strandedBackup);

    let renameCalls = 0;
    const rename = (from, to) => {
      renameCalls += 1;
      // 1: stranded backup -> destination (recovery). 2: destination -> backup.
      // 3: staging -> destination (fails). 4: backup -> destination (restore).
      if (renameCalls === 3) {
        throw new Error("EBUSY: resource busy or locked, rename");
      }
      renameSync(from, to);
    };

    assert.throws(
      () =>
        buildProbeAndPublishRuntime({
          stagingDir,
          destinationDir,
          build: () => {},
          probe: () => {},
          rename,
        }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 4);
    assert.equal(hashTree(destinationDir), strandedHash);
    assert.equal(existsSync(strandedBackup), false);
  });
});

test("a backup left by an interrupted run is swept when the next publish succeeds", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    const orphan = `${destinationDir}.previous-999999`;
    writeTree(orphan, { "junk.txt": "runtime left by an interrupted run" });

    const warnings = [];
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      warn: (message) => warnings.push(message),
    });

    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    assert.equal(existsSync(orphan), false);
    assert.equal(warnings.length, 0);
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
