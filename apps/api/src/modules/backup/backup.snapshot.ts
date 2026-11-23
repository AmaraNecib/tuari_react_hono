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

import { escapeSqliteString, SQLCIPHER_CONFIG_PRAGMAS } from "../../infrastructure/database/factory";

import type { BackupSnapshotResult, BackupSnapshotter } from "./backup.types";

const SNAPSHOT_WORKER_CODE = `
const { parentPort, workerData } = require("node:worker_threads");

const post = (message) => parentPort.postMessage(message);

const applyKey = (db) => {
  if (!workerData.databaseKey) return;
  for (const pragma of workerData.cipherConfigPragmas) db.pragma(pragma);
  db.pragma("key = '" + String(workerData.databaseKey).replace(/'/g, "''") + "'");
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
  let attachments;
  if (workerData.attachmentsRootPath) {
    const fs = require("node:fs");
    const path = require("node:path");
    const crypto = require("node:crypto");
    const root = path.resolve(workerData.attachmentsRootPath);
    const destination = path.join(path.dirname(workerData.outputPath), "attachments");
    const within = (base, relative) => {
      const result = path.resolve(base, relative);
      const remainder = path.relative(base, result);
      if (!remainder || remainder.startsWith("..") || path.isAbsolute(remainder)) {
        throw new Error("Attachment path escaped storage root");
      }
      return result;
    };
    const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
    attachments = { linked: 0, copied: 0, fallbackReasons: [] };
    const exists = copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='inventory_invoice_attachment'").get();
    const rows = exists ? copy.prepare("SELECT relative_path, sha256 FROM inventory_invoice_attachment").all() : [];
    const included = new Map();
    for (const row of rows) {
      const live = within(root, row.relative_path);
      let digest = row.sha256;
      if (digest != null && !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid attachment SHA-256");
      let object = digest ? path.join(root, "attachments-store", digest, "object") : null;
      if (!object || !fs.existsSync(object)) {
        const bytes = fs.readFileSync(live);
        const actual = hash(bytes);
        if (digest && actual !== digest) throw new Error("Attachment hash mismatch: " + row.relative_path);
        digest = actual;
        object = path.join(root, "attachments-store", digest, "object");
        fs.mkdirSync(path.dirname(object), { recursive: true });
        const temporary = object + "." + crypto.randomUUID();
        fs.writeFileSync(temporary, bytes, { flag: "wx" });
        try {
          try { fs.copyFileSync(temporary, object, fs.constants.COPYFILE_EXCL); }
          catch (error) { if (error.code !== "EEXIST") throw error; }
        } finally { fs.rmSync(temporary, { force: true }); }
      }
      if (hash(fs.readFileSync(object)) !== digest) throw new Error("Attachment object hash mismatch: " + row.relative_path);
      const target = within(destination, row.relative_path);
      if (included.has(target)) {
        if (included.get(target) !== digest) throw new Error("Conflicting attachment digests: " + row.relative_path);
        continue;
      }
      included.set(target, digest);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      try {
        fs.linkSync(object, target);
        attachments.linked++;
      } catch (error) {
        if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP", "EMLINK", "ENOSYS"].includes(error.code)) throw error;
        fs.copyFileSync(object, target, fs.constants.COPYFILE_EXCL);
        attachments.copied++;
        attachments.fallbackReasons.push(row.relative_path + ": " + error.code);
      }
    }
  }
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
      ...(attachments ? { attachments } : {}),
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
  /** Include DB-referenced attachments from this live storage root. */
  attachmentsRootPath?: string;
  /** SQLCipher key, when the database is encrypted. */
  databaseKey?: string | null;
  /**
   * Bound on one copy. A hung output mount (an SMB share that never returns)
   * would otherwise leave the promise pending forever — no backup, no recorded
   * failure, and the scheduler's `scheduled` latch stuck true. Defaults to
   * {@link DEFAULT_SNAPSHOT_TIMEOUT_MS}.
   */
  timeoutMs?: number;
};

/**
 * Generous cap on one snapshot: bounded, but far above any plausible local
 * `VACUUM INTO`, so only a genuinely stuck copy is terminated.
 */
export const DEFAULT_SNAPSHOT_TIMEOUT_MS = 30 * 60 * 1000;

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
  | ({ ok: true } & BackupSnapshotResult)
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
    options.databaseKey ? "better-sqlite3-multiple-ciphers" : "better-sqlite3",
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS;

  return (outputPath: string) =>
    new Promise<BackupSnapshotResult>((resolve, reject) => {
      const worker = new Worker(SNAPSHOT_WORKER_CODE, {
        eval: true,
        workerData: {
          modulePath,
          databasePath: options.databasePath,
          attachmentsRootPath: options.attachmentsRootPath,
          outputPath,
          databaseKey: options.databaseKey ?? null,
          cipherConfigPragmas: SQLCIPHER_CONFIG_PRAGMAS,
          vacuumSql: `VACUUM INTO '${escapeSqliteString(outputPath)}'`,
        },
      });

      // A hung output mount (an SMB share that never returns) would otherwise
      // leave this promise pending forever: no backup and, worse, no recorded
      // failure. Bound it; the timeout terminates the worker and reports a
      // normal rejection the service already handles.
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new Error(`snapshot timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();

      const settle = (finish: () => void) => {
        clearTimeout(timer);
        finish();
      };

      worker.once("message", (message: SnapshotWorkerMessage) => {
        settle(() => {
          if (message.ok) {
            resolve({
              schemaVersion: message.schemaVersion,
              encrypted: message.encrypted,
              ...(message.attachments ? { attachments: message.attachments } : {}),
            });
          } else {
            reject(new Error(message.error));
          }
        });
      });

      /* v8 ignore start -- worker bootstrap failure (failed module load, OOM) is not reproducible on demand; the worker reports ordinary snapshot failures as a message */
      worker.once("error", (error) => {
        settle(() => reject(error));
      });
      /* v8 ignore stop */
    });
};
