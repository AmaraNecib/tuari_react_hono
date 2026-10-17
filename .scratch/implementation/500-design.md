# #500 — the encrypted binding: better-sqlite3-sqlcipher → better-sqlite3-multiple-ciphers

## The problem, in two layers

`apps/api` depended on `better-sqlite3-sqlcipher@5.4.3-3` — the newest published
version (`npm view` lists `5.4.3-1/2/3` and nothing else). It is
`better-sqlite3@5.4.3` (2019) relinked against SQLCipher.

1. **It never installed.** `pnpm-workspace.yaml`'s `onlyBuiltDependencies` listed
   `better-sqlite3` and `prisma` but not the fork, so its
   `install: prebuild-install || node-gyp rebuild` script never ran and no addon
   was ever fetched. `factory.ts` still ran `PRAGMA key`, so a keyed database was
   written **plaintext** under an `encrypted_db` licence. That is the bug #402's
   gate was built to catch.
2. **It cannot be built on any supported Node.** With the script allowed and a
   real toolchain (`windows-2022`, `find VS using VS2022 (17.14.37710.0)`), the
   fork's C++ does not compile: `'ALL_CAN_READ': illegal qualified name`,
   `'New': is not a member of 'v8'`, `node::AtExit` arity,
   `'CreationContext': is not a member of 'v8::Object'`. `CreationContext` was
   removed in V8 8.x (Node 14). A newer Node ships a newer V8 with more removed,
   so Node 24/26 is worse, not better.

## Decision

Swap the encrypted binding to **`better-sqlite3-multiple-ciphers@^13.0.3`**
(`engines: node >=22`). It is a maintained fork of modern better-sqlite3, and it
ships **`prebuilds/<platform>-<arch>.node` in the tarball** (eight platforms,
including `win32-x64`) with no install script — so it needs no compiler on any
machine, which is what makes the Windows proof job buildable at all.

`onlyBuiltDependencies` deliberately does **not** list it: the package carries a
`binding.gyp`, so listing it makes pnpm run `node-gyp rebuild` and reintroduce
the toolchain requirement. This is written down in `pnpm-workspace.yaml`,
because it looks like an omission.

## Two behaviours that differ from the old fork

1. **`PRAGMA cipher_version` returns nothing.** This is a
   SQLite3MultipleCiphers build, not SQLCipher proper, so that pragma is not
   exposed (`pragma()`, `pragma(simple)`, `prepare().get()`, `prepare().all()`
   all come back empty). A gate must therefore detect the cipher another way:
   `PRAGMA cipher` returns the active cipher name (`[{"sqlcipher":"sqlcipher"}]`)
   where a plain better-sqlite3 build returns no rows, and the behavioural proof
   is a keyed write whose file is not `SQLite format 3` plus a keyed read — a
   wrong-cipher or wrong-key read throws `file is not a database`.
2. **The default cipher is `chacha20`, not SQLCipher.** `factory.ts` now pins the
   cipher **before** the key (the cipher selects the KDF, so setting it after
   `key` applies it too late):
   `cipher = 'sqlcipher'` → `cipher_compatibility = 4` → `key = '...'`.
   That keeps the documented SQLCipher 4 / AES-256 file format instead of
   silently changing the on-disk format, and it is verified by discrimination: a
   file written as `sqlcipher` throws when read as the default, and vice versa.

Unkeyed databases still use plain `better-sqlite3`, unchanged.

## Also fixed here

`createDatabaseConnection` leaked the native handle when setup failed — the
wrong-key path throws inside `journal_mode = WAL` — which on Windows kept the
database file locked. Setup is now wrapped, the connection is closed, and the
original error is rethrown.

## Evidence

`apps/api/src/infrastructure/database/factory.encryption.test.ts` (4 tests):
file bytes are not `SQLite format 3` and do not contain the plaintext string; the
right key reads its row back; the wrong key fails closed at open; `PRAGMA cipher`
reports `sqlcipher`; an unkeyed database is still plaintext SQLite.

## Follow-up

`#496`/`#499` (#402/#410) still carry the gate, which must be re-derived against
`PRAGMA cipher` rather than `cipher_version` when they rebase onto this.
