/**
 * Worker-backed database snapshot (#430 review round 2).
 *
 * `VACUUM INTO` is synchronous and takes as long as it takes to read and
 * rewrite the whole database. Run on the API's shared better-sqlite3
 * connection it blocks the event loop for that whole time — the API stops
 * answering, `/health` included — and it cannot run while another module's
 * transaction is open on that same connection. Both problems disappear when the
 * copy runs on a DEDICATED connection inside a worker thread:
 *
 *  - the event loop keeps turning while the copy runs (a timer still fires);
 *  - the copy never shares the connection the repositories serialize on, so a
 *    snapshot cannot interleave with a transaction.
 *
 * `VACUUM INTO` (not a file copy, not the online-backup API) is kept because it
 * is the one copy that is consistent under WAL and preserves SQLCipher
 * encryption with the key in force when it was taken.
 *
 * The worker body is an inline string on purpose: it must load unchanged from
 * the `tsx` dev server (TypeScript, ESM) and from the bundled CJS `dist`
 * artifact, and a separate `.ts`/`.cjs` file would need its own build step to
 * be present at both paths. It receives only absolute paths and the escaped
 * SQL, and reports back the copy's `PRAGMA integrity_check` result.
 */
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

import { escapeSqliteString } from "../../infrastructure/database/factory";

import type { BackupSnapshotResult, BackupSnapshotter } from "./backup.types";

const SNAPSHOT_WORKER_CODE = `
const { parentPort, workerData } = require("node:worker_threads");

const post = (message) => parentPort.postMessage(message);

const applyKey = (db) => {
  if (!workerData.databaseKey) return;
  db.pragma("key = '" + String(workerData.databaseKey).replace(/'/g, "''") + "'");
  db.pragma("cipher_compatibility = 4");
};

try {
  const Database = require(workerData.modulePath);

  const source = new Database(workerData.databasePath);
  source.pragma("busy_timeout = 5000");
  applyKey(source);
  source.exec(workerData.vacuumSql);
  source.close();

  const copy = new Database(workerData.outputPath);
  copy.pragma("busy_timeout = 5000");
  applyKey(copy);
  const integrity = copy.pragma("integrity_check");
  const schemaVersion = copy.pragma("user_version", { simple: true });
  copy.close();

  const checked =
    Array.isArray(integrity) && integrity.length > 0
      ? integrity[0].integrity_check
      : null;
  if (checked !== "ok") {
    post({ ok: false, error: "snapshot failed PRAGMA integrity_check" });
  } else {
    post({
      ok: true,
      schemaVersion: Number(schemaVersion) || 0,
      encrypted: Boolean(workerData.databaseKey),
    });
  }
} catch (error) {
  post({
    ok: false,
    error: error && error.message ? error.message : String(error),
  });
}
`;

export type SnapshotWorkerOptions = {
  /** Live database file the worker reads a consistent snapshot of. */
  databasePath: string;
  /** SQLCipher key, when the database is encrypted. */
  databaseKey?: string | null;
};

/**
 * Resolve a SQLite driver module to an absolute path, from the API package.
 *
 * The bundled API is CommonJS, where `import.meta.url` is empty (esbuild
 * replaces it with an empty object) but `__filename` is real; the dev server is
 * ESM, where the reverse is true. `typeof` never throws on either, so this
 * picks a usable base in both. Resolving here — rather than in the worker —
 * anchors the driver to the API package instead of the worker's cwd, so the
 * worker loads the same binding (plain or SQLCipher) the API uses.
 */
const resolveDriverModule = (specifier: string): string => {
  /* v8 ignore start -- CJS-bundle branch: the ESM dev server and test runner never define `__filename`; see the doc comment above */
  const base: string = typeof __filename === "string" ? __filename : import.meta.url;
  /* v8 ignore stop */
  return createRequire(base).resolve(specifier);
};

type SnapshotWorkerMessage =
  | { ok: true; schemaVersion: number; encrypted: boolean }
  | { ok: false; error: string };

/**
 * Create a snapshot writer that runs `VACUUM INTO` on a dedicated connection
 * in a worker thread. The resolved SQLite module is passed to the worker as an
 * absolute path so it loads the same binding (plain or SQLCipher) the API uses,
 * regardless of the worker's working directory.
 */
export const createWorkerSnapshotter = (
  options: SnapshotWorkerOptions,
): BackupSnapshotter => {
  const modulePath = resolveDriverModule(
    options.databaseKey ? "better-sqlite3-sqlcipher" : "better-sqlite3",
  );

  return (outputPath: string) =>
    new Promise<BackupSnapshotResult>((resolve, reject) => {
      const worker = new Worker(SNAPSHOT_WORKER_CODE, {
        eval: true,
        workerData: {
          modulePath,
          databasePath: options.databasePath,
          databaseKey: options.databaseKey ?? null,
          vacuumSql: `VACUUM INTO '${escapeSqliteString(outputPath)}'`,
        },
      });

      worker.once("message", (message: SnapshotWorkerMessage) => {
        if (message.ok) {
          resolve({
            schemaVersion: message.schemaVersion,
            encrypted: message.encrypted,
          });
        } else {
          reject(new Error(message.error));
        }
      });

      /* v8 ignore start -- worker bootstrap failure (failed module load, OOM) is not reproducible on demand; the worker reports ordinary snapshot failures as a message */
      worker.once("error", (error) => {
        reject(error);
      });
      /* v8 ignore stop */
    });
};
