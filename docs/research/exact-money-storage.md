# Production exact-money storage research

Reproduce the native proof below before changing a money writer.

## Resolution

[#521](https://github.com/AmaraNecib/tuari_react_hono/issues/521) has a viable storage route on the selected production drivers. Both bind and read the complete signed int64 range exactly with native BigInt and statement-local integer reads. Neither needs a replacement dependency. The actual keyed factory and snapshot worker passed the same money fixtures as the plain factory.

This is feasibility research, not approval of an adapter, financial contract or migration. The next prerequisite is the owner's [#522 decision](https://github.com/AmaraNecib/tuari_react_hono/issues/522). Do not start or activate [#523](https://github.com/AmaraNecib/tuari_react_hono/issues/523) before that decision. No money representation, existing database, writer, UI, package, wire contract or application source changed here.

The release scope in [map #519](https://github.com/AmaraNecib/tuari_react_hono/issues/519) and [spec #520](https://github.com/AmaraNecib/tuari_react_hono/issues/520) stays all 17 existing monetary tables and 27 money/rate columns plus new monetary fields. Quantities, days and percentages stay separate. [#427](https://github.com/AmaraNecib/tuari_react_hono/issues/427) is reference, not approval of unresolved choices.

## Exact tested source and runtime

Application source: `17d6277bee359a059d0af5d5befaa887446fae9b`, freshly fetched `origin/develop`. Observed on Windows x64, Node `v22.23.2`, native module ABI `127`, pnpm `10.8.1`, 2026-11-09. A frozen-lockfile install succeeded without changing manifests or the lockfile. The encrypted prebuild was loaded, not rebuilt.

| Factory selection | Locked driver | Observed SQLite |
| --- | --- | --- |
| No key | `better-sqlite3@12.6.2` | `3.51.2` |
| Configured research key | `better-sqlite3-multiple-ciphers@13.0.3` | `3.53.4` |

Primary source anchors at that revision:

- [Factory and parameter proxy](../../apps/api/src/infrastructure/database/factory.ts), [driver manifest](../../apps/api/package.json), [frozen versions](../../pnpm-lock.yaml).
- [Initializer](../../apps/api/src/infrastructure/database/schema.ts), [physical definitions](../../apps/api/src/infrastructure/database/schema-definitions.ts), [executor](../../apps/api/src/infrastructure/database/sqlite-executor.ts).
- [Worker snapshotter](../../apps/api/src/modules/backup/backup.snapshot.ts), [encryption tests and upstream known-file proof](../../apps/api/src/infrastructure/database/factory.encryption.test.ts), [fixture provenance](../../apps/api/src/infrastructure/database/fixtures/README.md).
- [Sidecar build](../../apps/desktop/scripts/build-sidecar.mjs), [staged runtime publication](../../apps/desktop/scripts/runtime-staging.mjs), [portable build](../../apps/desktop/scripts/build-portable.mjs), [built-runtime proof](../../apps/desktop/scripts/sqlcipher-encryption-proof.mjs).
- [Drizzle construction](../../apps/api/src/infrastructure/database/drizzle.ts), [payment declarations](../../apps/api/src/schema/payment.ts), [actual payment adapter](../../apps/api/src/modules/payment/adapters/payment.repository.ts).

The published research commit pins these relative source references through its parent revision. This is not a claim that the whole application already handles money exactly.

## Observed native behavior

All assertions below ran through `createDatabaseConnection`, not Node's built-in SQLite, a mock, or an alternate test driver.

| Contract | Result on both selected drivers |
| --- | --- |
| Signed bind and readback | Exact `-9223372036854775808` through `9223372036854775807`, including adjacent values above JS safe-integer range |
| Default read | Stored `9007199254740993n` reads as number `9007199254740992`. This is a demonstrated lossy path |
| Scoped read | `safeIntegers(true)` on one statement returns BigInt for all its integer columns, including IDs and flags. A separate statement still returns numbers |
| Read forms and ordering | `all`, `get`, `iterate` and raw-array reads retain digits. Integer `ORDER BY amount,id` and an int64-bound cursor distinguish adjacent large values |
| Bounds and nullability | Out-of-int64 BigInt binds reject. INTEGER with an explicit integer-type CHECK rejects fractional input. NULL stays NULL; integer zero reads as `0n` |

Additional observations:

1. Statement-local mode does not mean column-local mode. REAL quantity `1.125` and TEXT stay their native types, but integer IDs and boolean flags in the same projection become BigInt. A narrow adapter must decode or isolate those columns deliberately.
2. `defaultSafeIntegers(true)` affects newly prepared statements, not already prepared ones. The probe restored the default afterward. Toggling it on a shared application connection is not a safe local money adapter.
3. SQL `sum` over the two adjacent large positive fixtures reads exactly as `18014398509481985n` in safe mode. A sum exceeding int64 rejects with integer overflow. Full-range per-value storage does not establish approved aggregate bounds. Do not substitute `total()` or cast to REAL.
4. `CAST(amount AS TEXT)` yields exact decimal strings on both drivers when ordering by the underlying integer column. This is a second narrow read option, not permission to store money as text.
5. The factory preserves BigInt bind parameters and normalizes boolean parameters. Its generic fluent-method binding returns the native statement from `safeIntegers`; retain the original proxy and invoke `safeIntegers(true)` separately. Chaining and then binding boolean/Date parameters can bypass normalization.

Upstream implementation corroboration: [plain driver's integer documentation](https://github.com/WiseLibs/better-sqlite3/blob/v12.6.2/docs/integer.md), [plain conversion code](https://github.com/WiseLibs/better-sqlite3/blob/v12.6.2/src/util/data.cpp), and [encrypted driver's source](https://github.com/m4heshd/better-sqlite3-multiple-ciphers/tree/v13.0.3/src). Executed behavior, not those links alone, establishes the results here.

## Narrow adapter comparison

| Option | Exactness and integration cost | Recommendation |
| --- | --- | --- |
| Native BigInt binds and statement-local safe reads | Full int64 proven. Explicit money projections and validators isolate integer decoding. Existing counts, flags and timestamps elsewhere stay unchanged | Preferred candidate for #522, not an approved physical contract |
| Native BigInt binds and decimal TEXT projection | Exact decimal read strings proven. Parse once into private BigInt; retain integer comparisons, ordering and aggregates. Aliasing an amount as text and ordering by that alias risks lexical order | Viable fallback where a query layer cannot expose per-statement mode |
| Drizzle custom type alone | Can map a value only after the driver reads it. The locked better-sqlite3 session calls `client.prepare`, `get/all` and `raw`; it does not enable safe integers. `BigInt(roundedNumber)` cannot recover lost digits | Insufficient alone. Needs an exact driver projection/read strategy and typed integration proof |
| Global default or number bridge | Global BigInt changes unrelated integer consumers. Number bridges lose digits before business code sees them; dual writable balances introduce reconciliation and double-scaling risks | Reject for this route |

The eventual seam should hide int64 range checking and exact decode behind the money repository's existing operations, not expose a generic new database framework. Never infer currency, unit or rate scale from a column's SQL type. Scale exactly once at the approved input/transition boundary and carry the typed amount unchanged afterward.

## Initialization, transition, reopen and recovery

The probe initializes real application tables with `ensureDatabaseSchema(new BetterSqlite3Executor(db))` on both drivers. It repeats initialization before and after closing/reopening. It asserts the actual fresh `payment` table has `total_amount REAL`, not `amount_dzd`. The active payment adapter agrees with the initializer, while Drizzle declares `amount_dzd`; allocation has the analogous `amount` versus `amount_dzd` disagreement. A future conversion must reconcile initialized-table behavior and declarations together. This research does not rename either.

The actual startup path calls `createAppDependencies`, which runs `ensureDatabaseSchema`, before serving traffic. Initialization has individual migration transactions, not one all-or-nothing transaction around the complete sequence. The separate `runMigrations` manifest runner has no production caller at this revision. A future transition must integrate with the real startup path rather than assume that runner is active. See [entry point](../../apps/api/src/index.ts), [composition root](../../apps/api/src/app/dependencies.ts) and [manifest runner](../../apps/api/src/infrastructure/database/migration-runner.ts).

On isolated `proof_*` tables only, a transaction adds a tag, updates rows and advances a marker. Injected failure rolls back DDL, data and marker. Reopening the same file, repeating initialization and retrying succeeds. Exact amounts survive. This demonstrates the selected drivers' transactional mechanism, not a production migration for current REAL values. Existing rounded REAL data cannot disclose its original decimal intent.

Real `createWorkerSnapshotter` workers take pre-transition and post-transition `VACUUM INTO` snapshots while the source is open in WAL mode. Fresh copied recovery candidates reopen with the correct key, reinitialize and retain every int64 plus the expected marker. The source and both encrypted snapshots reject a wrong key, no key, and the plain driver. Source integrity and foreign-key checks pass; recovered copies pass integrity checks.

The existing [restore instructions](../backups.md#how-to-restore) describe manual replacement with the app closed, not an in-app restore-and-migrate operation. Snapshots need the key used when taken, including an old key after rotation, and do not include attachments. The ordinary startup backup is scheduled after readiness; it is not a pre-migration recovery checkpoint.

These tests do not prove an entire application's backup manifest/restore orchestration, process-kill or power-loss recovery, contested writers, or backward-compatible old-client writes. They do not convert any existing money column. Snapshot reopening proves a usable recovery building block, not permission to overwrite an existing file. Keep originals and use a new validated candidate for every rehearsal.

## External feasibility constraints

[#500](https://github.com/AmaraNecib/tuari_react_hono/issues/500) and [#402](https://github.com/AmaraNecib/tuari_react_hono/issues/402) were both still OPEN when inspected. Their issue state is not proof of a current runtime failure, and this research does not close or take them over.

The old unbuildable `better-sqlite3-sqlcipher@5.4.3-3` is no longer selected. [Merged #504](https://github.com/AmaraNecib/tuari_react_hono/pull/504), merge `6ba4146475ad3391b4f9f0007d043907a6cb93fe`, installed the current route. The factory selects the encrypted package for a configured key and throws on load/setup failure instead of falling back to plain SQLite. Configuration is `cipher='sqlcipher'`, then `legacy=4`, then key. An empty `cipher_version` is not the availability oracle for this driver.

The owner subsequently [replaced the mandatory version pragma with behavioral acceptance](https://github.com/AmaraNecib/tuari_react_hono/issues/410#issuecomment-6740821359), recorded in [#499](https://github.com/AmaraNecib/tuari_react_hono/pull/499). Live #410 is now CLOSED after accepted built-Windows behavior; #504's earlier unmet-version language is historical. This does not authorize an encrypted release or installer acceptance. [Feature documentation](../editions-and-features.md) still marks the release capability parked; #521 makes no product activation claim.

The current sidecar build requires both native drivers, copies the host Node executable, stages packages and verifies the encrypted prebuild. [Merged #509](https://github.com/AmaraNecib/tuari_react_hono/pull/509), merge `043b928d01966ef085e8ca59846d5b8a59fbf7d3`, also gates portable-only distribution through the built-runtime proof. [Hosted built-artifact job](https://github.com/AmaraNecib/tuari_react_hono/actions/runs/42642509449/job/129247125680) succeeded on Windows at head `c350fce83007d924a584b6e611dcee98f197923c`; the build, encryption proof and keyed-tests steps actually ran, rather than a selector-only skip.

A source comparison from that hosted head to the tested application revision found no changes in the factory, snapshotter, API manifest, lockfile, sidecar build, encryption proof or availability script. That historical job proves its artifact, not a fresh #521 packaged artifact or full-range money in that artifact. The new local full-range proof uses the actual locked drivers and factory on the same Node version used for local packaging. Seven existing factory encryption tests include reading the independent official SQLCipher 4 fixture, with 78,536 expected rows.

Observed native activation blocker: none on this tested Windows/Node/driver combination. If a target build later cannot produce/load this selected encrypted runtime, wire that concrete external blocker before activation becomes takeable and rerun the actual-driver proof after repair. Another package's success, a plain fallback or a green skipped job cannot waive it. No replacement package was added or vetted by #521.

## Safe integration and activation sequence

1. Use this proof as input to #522. The owner must choose physical/wire representation, currency ownership and identity, bounds, price/rate precision, signed and fractional rounding, and treatment of existing development schema. No real/customer data does not authorize deletion, resetting or guessed conversions.
2. Only after that decision, expand an inert foundation and inventory every reader/writer for all 17 tables, 27 existing money/rate columns and new fields. Keep quantities separate and the single authoritative ledger. Independently green batches are safe only if they leave current workflows unchanged and do not expose dual writes, lossy bridges or partial contracts.
3. If call-site or schema conversion cannot remain inert and green independently, use a dependent integration sequence that remains unmerged/unreleased until its whole exact representation works. Do not merge half-converted producers against old consumers. Test initialized schemas and the actual selected drivers, not just Drizzle declarations.
4. Before activation, obtain the owner-approved non-destructive transition and verified recovery plan. Preserve original files and keys; rehearse with fresh copies, validate schema markers, units, links, amounts and integrity, then test repeat/reopen and failure/retry. Gate startup on successful migration before writers, background work or traffic. Serialize migration work, keep transaction callbacks synchronous or use existing coordinated transaction ownership, and reject unsupported schema/client versions. After new writes, do not restore a stale pre-transition snapshot and claim lossless rollback.
5. Release only after the exhaustive app-wide writer/read-path check, approved contract, production plain/encrypted and real restore tests, current-head CI/hosted review, and effective protection. Record the supported target runtime, schema/version compatibility, rollback cutoff and activation authority. This research authorizes none of those changes.

This sequence compares routes, not chooses the owner's transition policy. It does not start any successor issue or FX/selectable-currency feature.

## Reproduce the proof

Run from a clean checkout at the pinned application revision or the research commit whose application source is unchanged. Use Node 22 on Windows x64 for the observed baseline, install only the frozen lockfile, and leave `APP_DB_KEY` unset. Other platforms need their own observed proof. The embedded fixture key is public research data, never a production credential.

From the repository root, create a fresh replay parent directory before saving the script:

```powershell
New-Item -ItemType Directory -Path .scratch/reviews/521-replay -ErrorAction Stop | Out-Null
```

Save the single `cts` block below as `.scratch/reviews/521-replay/probe.cts`. The parent now exists; keep `data-1` absent so the probe can create it exclusively. Run from the repository root:

```powershell
pnpm install --frozen-lockfile
node apps/api/node_modules/tsx/dist/cli.mjs .scratch/reviews/521-replay/probe.cts .scratch/reviews/521-replay/data-1
pnpm --filter @tuari/api exec vitest run src/infrastructure/database/factory.encryption.test.ts src/infrastructure/database/migration-recovery.test.ts src/modules/backup/backup.snapshot.test.ts
```

Choose a fresh output directory for every run. The probe refuses an existing one and never deletes anything. The preexisting focused tests manage only their own temporary fixtures.

The initial bounded probe passed in 5.72 seconds. The expanded embedded probe, extracted back from this asset, passed in 4.79 seconds. The focused source tests passed 20/20 across three files, no skips, in 5.41 seconds wall time. Operational logs, generated databases, and local review reports stay ignored under `.scratch/reviews/521/`; they are not published research assets. Full suites/builds are CI-final, not local prerequisites for this research. No new PR, hosted verdict, merge SHA or current-head CI acceptance is claimed by publishing this research branch.

```cts
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.cwd();
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const { createDatabaseConnection } = require(path.join(root, 'apps/api/src/infrastructure/database/factory.ts'));
const { ensureDatabaseSchema } = require(path.join(root, 'apps/api/src/infrastructure/database/schema.ts'));
const { BetterSqlite3Executor } = require(path.join(root, 'apps/api/src/infrastructure/database/sqlite-executor.ts'));
const { createWorkerSnapshotter } = require(path.join(root, 'apps/api/src/modules/backup/backup.snapshot.ts'));
const Plain = apiRequire('better-sqlite3');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output); // Refuse existing paths. Keep all generated files for inspection.
const expected = [-9223372036854775808n, -9007199254740993n, -1n, 0n, 1n, 9007199254740991n, 9007199254740992n, 9007199254740993n, 9223372036854775807n];
const log = (event, value) => console.log(JSON.stringify({ event, value }, (_, v) => typeof v === 'bigint' ? `${v}n` : v));
const rejectsRead = (file, key) => {
  let db;
  try {
    db = createDatabaseConnection(file, key);
    assert.throws(() => db.prepare('SELECT * FROM proof_money').all(), /not a database|encrypted/i);
  } catch (error) {
    assert.match(error.message, /not a database|encrypted/i);
  } finally { db?.close(); }
};
async function main() {
  assert.equal(process.env.APP_DB_KEY, undefined, 'Run with APP_DB_KEY unset.');
  log('runtime', { node: process.version, platform: process.platform, arch: process.arch, abi: process.versions.modules });
  for (const [name, key] of [['plain', ''], ['encrypted', '521-research-only-key']]) {
    const driver = name === 'plain' ? 'better-sqlite3' : 'better-sqlite3-multiple-ciphers';
    log('driver', { name: driver, version: apiRequire(`${driver}/package.json`).version, resolved: apiRequire.resolve(driver) });
    const file = path.join(output, `${name}.sqlite`);
    let db = createDatabaseConnection(file, key);
    try {
      log(`${name}-sqlite`, db.prepare('SELECT sqlite_version() AS version').get());
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      const paymentColumns = db.pragma('table_info(payment)').map((r) => [r.name, r.type]);
      assert.ok(paymentColumns.some(([n, t]) => n === 'total_amount' && t === 'REAL'));
      assert.ok(!paymentColumns.some(([n]) => n === 'amount_dzd'));
      log(`${name}-payment-columns`, paymentColumns);
      db.exec(`CREATE TABLE proof_money (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL CHECK(typeof(amount)='integer'), flag INTEGER, quantity REAL, note TEXT);
        CREATE INDEX proof_money_order ON proof_money(amount, id);
        CREATE TABLE proof_version (version INTEGER NOT NULL); INSERT INTO proof_version VALUES (0);`);
      const insert = db.prepare('INSERT INTO proof_money(id,amount,flag,quantity,note) VALUES (@id,@amount,@flag,@quantity,@note)');
      for (let i = expected.length - 1; i >= 0; i--) insert.run({ id: i + 1, amount: expected[i], flag: true, quantity: 1.125, note: 'fixture' });
      const exact = db.prepare('SELECT id,amount,flag,quantity,note FROM proof_money ORDER BY amount,id');
      exact.safeIntegers(true); // Separate call: chaining returns the native statement, outside the factory proxy.
      const rows = exact.all();
      assert.deepEqual(rows.map((r) => r.amount), expected);
      assert.deepEqual([...exact.iterate()].map((r) => r.amount), expected);
      assert.equal(exact.get().amount, -9223372036854775808n);
      const textProjection = db.prepare('SELECT CAST(amount AS TEXT) AS amount_text FROM proof_money ORDER BY proof_money.amount,id');
      assert.deepEqual(textProjection.all().map((r) => r.amount_text), expected.map(String));
      const raw = db.prepare('SELECT amount FROM proof_money ORDER BY amount,id').raw();
      raw.safeIntegers(true);
      assert.deepEqual(raw.all().map((r) => r[0]), expected);
      assert.equal(typeof rows[0].id, 'bigint');
      assert.equal(typeof rows[0].flag, 'bigint');
      assert.equal(rows[0].flag, 1n);
      assert.equal(rows[0].quantity, 1.125);
      assert.equal(rows[0].note, 'fixture');
      const ordinary = db.prepare('SELECT amount, flag FROM proof_money WHERE id=8').get();
      assert.equal(typeof ordinary.flag, 'number');
      assert.equal(ordinary.amount, 9007199254740992); // Deliberately demonstrates loss of 9007199254740993.
      const cursor = db.prepare('SELECT amount FROM proof_money WHERE amount > ? ORDER BY amount,id');
      cursor.safeIntegers(true);
      assert.deepEqual(cursor.all(9007199254740992n).map((r) => r.amount), [9007199254740993n, 9223372036854775807n]);
      const sum = db.prepare('SELECT sum(amount) AS amount FROM proof_money WHERE id IN (7,8)');
      sum.safeIntegers(true);
      assert.equal(sum.get().amount, 18014398509481985n);
      assert.throws(() => db.prepare('SELECT sum(amount) FROM proof_money WHERE id IN (8,9)').get(), /integer overflow/i);
      assert.throws(() => insert.run({ id: 20, amount: 9223372036854775808n, flag: false, quantity: 0, note: '' }), /range|bigint|64/i);
      assert.throws(() => insert.run({ id: 21, amount: -9223372036854775809n, flag: false, quantity: 0, note: '' }), /range|bigint|64/i);
      assert.throws(() => insert.run({ id: 22, amount: 1.25, flag: false, quantity: 0, note: '' }), /CHECK/i);
      db.exec('CREATE TABLE proof_nullable(amount INTEGER); INSERT INTO proof_nullable VALUES(NULL),(0)');
      const nullable = db.prepare('SELECT amount FROM proof_nullable ORDER BY rowid');
      nullable.safeIntegers(true);
      assert.deepEqual(nullable.all(), [{ amount: null }, { amount: 0n }]);
      const old = db.prepare('SELECT 7 AS count');
      db.defaultSafeIntegers(true);
      assert.equal(old.get().count, 7);
      assert.equal(db.prepare('SELECT 7 AS count').get().count, 7n);
      db.defaultSafeIntegers(false);
      assert.equal(db.prepare('SELECT 7 AS count').get().count, 7);
      const before = path.join(output, `${name}-before.sqlite`);
      const snapshot = createWorkerSnapshotter({ databasePath: file, databaseKey: key, timeoutMs: 30000 });
      assert.equal((await snapshot(before)).encrypted, Boolean(key));
      // Generic transaction rehearsal only. No proposed production money schema or conversion policy.
      const transition = (fail) => db.transaction(() => {
        db.exec('ALTER TABLE proof_money ADD COLUMN proof_tag TEXT');
        db.prepare('UPDATE proof_money SET proof_tag=?').run('v1');
        db.prepare('UPDATE proof_version SET version=1').run();
        if (fail) throw new Error('injected transition failure');
      })();
      assert.throws(() => transition(true), /injected transition failure/);
      assert.ok(!db.pragma('table_info(proof_money)').some((r) => r.name === 'proof_tag'));
      assert.equal(db.prepare('SELECT version FROM proof_version').get().version, 0);
      db.close(); db = createDatabaseConnection(file, key);
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      transition(false);
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      const after = path.join(output, `${name}-after.sqlite`);
      assert.equal((await snapshot(after)).encrypted, Boolean(key));
      db.close(); db = createDatabaseConnection(file, key);
      await ensureDatabaseSchema(new BetterSqlite3Executor(db));
      const reopened = db.prepare('SELECT amount FROM proof_money ORDER BY amount,id');
      reopened.safeIntegers(true);
      assert.deepEqual(reopened.all().map((r) => r.amount), expected);
      assert.equal(db.prepare('SELECT version FROM proof_version').get().version, 1);
      assert.equal(db.prepare('SELECT count(*) AS count FROM proof_money WHERE proof_tag=?').get('v1').count, 9);
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      for (const [source, version] of [[before, 0], [after, 1]]) {
        const recovered = `${source}.recovered`;
        fs.copyFileSync(source, recovered, fs.constants.COPYFILE_EXCL);
        const restored = createDatabaseConnection(recovered, key);
        try {
          await ensureDatabaseSchema(new BetterSqlite3Executor(restored));
          const read = restored.prepare('SELECT amount FROM proof_money ORDER BY amount,id'); read.safeIntegers(true);
          assert.deepEqual(read.all().map((r) => r.amount), expected);
          assert.equal(restored.prepare('SELECT version FROM proof_version').get().version, version);
          assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
        } finally { restored.close(); }
      }
      log(`${name}-proof`, { exactRows: rows.length, scopedIntegerMode: 'pass', defaultReadLoss: ordinary.amount, integerSortCursor: 'pass', boundsAndOverflow: 'pass', initRepeatReopen: 'pass', transitionRollbackRetry: 'pass', workerSnapshotsAndRecoveredCopies: 'pass' });
    } finally { db?.close(); }
    const header = fs.readFileSync(file).subarray(0, 16).toString('latin1');
    assert.equal(header === 'SQLite format 3\0', !key);
    if (key) {
      for (const target of [file, path.join(output, 'encrypted-before.sqlite'), path.join(output, 'encrypted-after.sqlite')]) {
        rejectsRead(target, 'wrong-key'); rejectsRead(target, '');
        const plain = new Plain(target, { readonly: true });
        try { assert.throws(() => plain.prepare('SELECT * FROM proof_money').all(), /not a database|encrypted/i); } finally { plain.close(); }
      }
      log('encrypted-negative-readers', 'wrong key, no key, plain reader rejected source and both snapshots');
    }
  }
  log('complete', 'both selected production factory drivers passed; no application money conversion activated');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

```
