import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildProbeAndPublishRuntime, ownerMarkerPath, writeOwnerMarker } from "./runtime-staging.mjs";

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
    const backupDir = `${destinationDir}.previous-1700000000000-4242`;
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
        now: () => 1700000000000,
        pid: 4242,
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
    const strandedBackup = `${destinationDir}.previous-1700000000000-999999`;
    rmSync(destinationDir, { recursive: true, force: true });
    writeTree(strandedBackup, { "marker.txt": "runtime from the interrupted run" });

    const logs = [];
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      isAlive: () => false,
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
    const strandedBackup = `${destinationDir}.previous-1700000000000-999999`;
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
          isAlive: () => false,
        }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 4);
    assert.equal(hashTree(destinationDir), strandedHash);
    assert.equal(existsSync(strandedBackup), false);
  });
});

test("recovery restores the newest backup, not the alphabetically first", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    // Equal digit counts, so an ascending name sort puts the OLDEST first and
    // `leftovers[0]` would restore the older runtime. The reviewer's
    // `previous-1000` / `previous-999` example is the same defect: a filename
    // sort is not a recency order (#409).
    const olderBackup = `${destinationDir}.previous-1700000000000-111`;
    const newerBackup = `${destinationDir}.previous-1700000001000-222`;
    writeTree(olderBackup, { "marker.txt": "older runtime" });
    writeTree(newerBackup, { "marker.txt": "newer runtime" });

    let renameCalls = 0;
    const rename = (from, to) => {
      renameCalls += 1;
      // 1: newest backup -> destination (recovery). 2: destination -> backup.
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
          isAlive: () => false,
        }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 4);
    // The newest backup was the one recovered, so it is what survived the
    // failed publish. A name-order pick would have left "older runtime" live.
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "newer runtime");
    assert.equal(existsSync(newerBackup), false);
    assert.equal(existsSync(olderBackup), true);
  });
});

test("a backup left by an interrupted run is swept when the next publish succeeds", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    const orphan = `${destinationDir}.previous-1700000000000-999999`;
    writeTree(orphan, { "junk.txt": "runtime left by an interrupted run" });

    const warnings = [];
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      isAlive: () => false,
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
    const staleBackup = `${destinationDir}.previous-1700000000000-4242`;
    writeTree(staleBackup, { "junk.txt": "half-copied tree from a crashed run" });

    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      now: () => 1700000000000,
      pid: 4242,
    });

    assert.equal(readdirSync(path.join(root, "src-tauri")).some((name) => name.includes(".previous-")), false);
    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
  });
});

test("a backup with a fresh ownership marker is not restored when the destination is missing", () => {
  // Two builds overlap: build A renamed `bin` aside and is mid-publish. Its
  // marker heartbeat is fresh, so build B must NOT treat A's in-flight backup
  // as stranded, or A loses the tree it needs for rollback (#409).
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    const activeBackup = `${destinationDir}.previous-1700000000000-777`;
    writeTree(activeBackup, { "marker.txt": "runtime a concurrent build is publishing" });
    writeOwnerMarker(activeBackup, { pid: 777, startedAt: 1700000000000, heartbeatAt: 1700000000000 });

    const logs = [];
    const rename = (from, to) => {
      // The publish rename is reached only because recovery left A's tree alone.
      if (from === stagingDir) {
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
          now: () => 1700000000001,
          // A DIFFERENT process holds pid 777, but the marker says it is the owner.
          isAlive: () => true,
          log: (message) => logs.push(message),
        }),
      /EBUSY/,
    );

    // The live build's backup and marker are untouched; nothing was restored.
    assert.equal(
      readFileSync(path.join(activeBackup, "marker.txt"), "utf8"),
      "runtime a concurrent build is publishing",
    );
    assert.equal(existsSync(ownerMarkerPath(activeBackup)), true);
    assert.equal(existsSync(destinationDir), false);
    assert.equal(logs.length, 0);
  });
});

test("a backup with a fresh ownership marker is not swept when the destination exists", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    const activeBackup = `${destinationDir}.previous-1700000001000-777`;
    const abandonedBackup = `${destinationDir}.previous-1700000000000-888`;
    writeTree(activeBackup, { "marker.txt": "runtime a concurrent build is publishing" });
    writeOwnerMarker(activeBackup, { pid: 777, startedAt: 1700000001000, heartbeatAt: 1700000001000 });
    writeTree(abandonedBackup, { "marker.txt": "runtime from a dead build" });

    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      now: () => 1700000001001,
      isAlive: () => true,
    });

    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    // The live build's backup survives the sweep...
    assert.equal(
      readFileSync(path.join(activeBackup, "marker.txt"), "utf8"),
      "runtime a concurrent build is publishing",
    );
    assert.equal(existsSync(ownerMarkerPath(activeBackup)), true);
    // ...while the one with no marker is still cleaned up.
    assert.equal(existsSync(abandonedBackup), false);
  });
});

test("recovery skips a backup with a fresh marker and restores the newest abandoned one", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    // Newer, but owned by a live build: recovery must not take it.
    const activeBackup = `${destinationDir}.previous-1700000001000-777`;
    // Older, no marker: the backup recovery may actually take.
    const abandonedBackup = `${destinationDir}.previous-1700000000000-888`;
    writeTree(activeBackup, { "marker.txt": "still publishing" });
    writeOwnerMarker(activeBackup, { pid: 777, startedAt: 1700000001000, heartbeatAt: 1700000001000 });
    writeTree(abandonedBackup, { "marker.txt": "abandoned runtime" });

    let renameCalls = 0;
    const rename = (from, to) => {
      renameCalls += 1;
      // 1: abandoned backup -> destination. 2: destination -> backup.
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
          now: () => 1700000001001,
          isAlive: () => true,
        }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 4);
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "abandoned runtime");
    assert.equal(existsSync(activeBackup), true);
    assert.equal(existsSync(ownerMarkerPath(activeBackup)), true);
    assert.equal(existsSync(abandonedBackup), false);
  });
});

test("a reused pid does not block recovery of a stale backup", () => {
  // The reported failure: build A moved `bin` aside, died, and later an
  // unrelated process received A's pid. PID liveness alone calls A's intact
  // backup "owned" and skips recovery even though `bin` is missing (#409). The
  // marker heartbeat stopped when A died, so the backup is abandoned anyway.
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    const staleBackup = `${destinationDir}.previous-1700000000000-777`;
    writeTree(staleBackup, { "marker.txt": "runtime A built before it died" });
    writeOwnerMarker(staleBackup, { pid: 777, startedAt: 1700000000000, heartbeatAt: 1700000000000 });

    let renameCalls = 0;
    const rename = (from, to) => {
      renameCalls += 1;
      // 1: stale backup -> destination (recovery). 2: destination -> backup.
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
          // A DIFFERENT, still-running process now holds pid 777.
          isAlive: (ownerPid) => ownerPid === 777,
          now: () => 1700000000000 + 60_000,
        }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 4);
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "runtime A built before it died");
    assert.equal(existsSync(staleBackup), false);
  });
});

test("a backup with no ownership marker is recovered", () => {
  // A marker-less backup (a legacy name, or one written before markers existed)
  // cannot belong to a live build of this version, so it is abandoned.
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    const legacyBackup = `${destinationDir}.previous-999`;
    writeTree(legacyBackup, { "marker.txt": "legacy runtime" });

    let renameCalls = 0;
    const rename = (from, to) => {
      renameCalls += 1;
      // 1: legacy backup -> destination (recovery). 2: destination -> backup.
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
          isAlive: () => true,
        }),
      /EBUSY/,
    );

    assert.equal(renameCalls, 4);
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "legacy runtime");
    assert.equal(existsSync(legacyBackup), false);
  });
});

test("a fresh marker whose owner pid is gone is abandoned", () => {
  // The pid probe is the tiebreaker: a still-fresh heartbeat plus a dead owner
  // means the owner crashed just now, so recover immediately instead of waiting
  // out the lease.
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    const crashedBackup = `${destinationDir}.previous-1700000000000-777`;
    writeTree(crashedBackup, { "marker.txt": "runtime from a crashed build" });
    writeOwnerMarker(crashedBackup, { pid: 777, startedAt: 1700000000000, heartbeatAt: 1700000000000 });

    const rename = (from, to) => {
      if (from === stagingDir) {
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
          isAlive: () => false,
          now: () => 1700000000001,
        }),
      /EBUSY/,
    );

    // Recovery took it: the crashed runtime is the live destination again.
    assert.equal(readFileSync(path.join(destinationDir, "marker.txt"), "utf8"), "runtime from a crashed build");
    assert.equal(existsSync(crashedBackup), false);
  });
});

test("a stale marker does not block recovery forever", () => {
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    const backup = `${destinationDir}.previous-1700000000000-777`;
    writeTree(backup, { "marker.txt": "runtime from a stalled build" });
    writeOwnerMarker(backup, { pid: 777, startedAt: 1700000000000, heartbeatAt: 1700000000000 });

    const forcePublishFailure = (from, to) => {
      if (from === stagingDir) {
        throw new Error("EBUSY: resource busy or locked, rename");
      }
      renameSync(from, to);
    };

    // First build: the marker is still fresh, so the backup is owned and not
    // recovered; the failed publish leaves the destination missing.
    assert.throws(
      () =>
        buildProbeAndPublishRuntime({
          stagingDir,
          destinationDir,
          build: () => {},
          probe: () => {},
          rename: forcePublishFailure,
          isAlive: () => true,
          now: () => 1700000000000 + 1_000,
        }),
      /EBUSY/,
    );
    assert.equal(existsSync(backup), true);
    assert.equal(existsSync(destinationDir), false);

    // The failed publish removed the staging tree, so rebuild it.
    writeTree(stagingDir, {
      "node.exe": "staged-node",
      [path.join("api-runtime", "package.json")]: '{"name":"staged"}',
    });

    // Later build: the heartbeat stopped, so the SAME backup is now abandoned
    // and recovered instead of leaving the machine with no runtime.
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      isAlive: () => true,
      now: () => 1700000000000 + 60_000,
    });

    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    assert.equal(existsSync(backup), false);
  });
});

test("a corrupt marker is owned while fresh and abandoned once its mtime ages", () => {
  // A partial/corrupt marker write still refreshes the file mtime, so a live
  // owner is never mistaken for a dead one; once the writer dies the mtime ages
  // and the backup is recoverable.
  withLayout(({ destinationDir, stagingDir }) => {
    rmSync(destinationDir, { recursive: true, force: true });
    const backup = `${destinationDir}.previous-1700000000000-777`;
    writeTree(backup, { "marker.txt": "runtime from a build with a corrupt marker" });
    writeFileSync(ownerMarkerPath(backup), "{ not valid json", "utf8");

    const forcePublishFailure = (from, to) => {
      if (from === stagingDir) {
        throw new Error("EBUSY: resource busy or locked, rename");
      }
      renameSync(from, to);
    };

    // Fresh mtime -> owned, so nothing is restored.
    assert.throws(
      () =>
        buildProbeAndPublishRuntime({
          stagingDir,
          destinationDir,
          build: () => {},
          probe: () => {},
          rename: forcePublishFailure,
          isAlive: () => true,
        }),
      /EBUSY/,
    );
    assert.equal(existsSync(backup), true);
    assert.equal(existsSync(destinationDir), false);

    writeTree(stagingDir, {
      "node.exe": "staged-node",
      [path.join("api-runtime", "package.json")]: '{"name":"staged"}',
    });
    utimesSync(ownerMarkerPath(backup), 0, 0);

    // Aged mtime -> stale, so the corrupt marker no longer blocks recovery.
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
      isAlive: () => true,
    });

    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    assert.equal(existsSync(backup), false);
  });
});

test("a successful publish removes this build's ownership marker", () => {
  withLayout(({ root, destinationDir, stagingDir }) => {
    buildProbeAndPublishRuntime({
      stagingDir,
      destinationDir,
      build: () => {},
      probe: () => {},
    });

    assert.equal(readFileSync(path.join(destinationDir, "node.exe"), "utf8"), "staged-node");
    assert.equal(
      readdirSync(path.join(root, "src-tauri")).some((name) => name.endsWith(".owner")),
      false,
    );
  });
});
