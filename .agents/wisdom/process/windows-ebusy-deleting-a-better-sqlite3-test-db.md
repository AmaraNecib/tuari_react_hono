## Windows EBUSY deleting a better-sqlite3 test DB (🟡 Minor)

`rmSync(dbDir, {recursive:true})` on a temp dir fails with `EBUSY: resource busy or locked`
when a better-sqlite3 connection to that file is still open (Windows file locking). Always
`deps.rawDatabase.close()` before deleting the temp DB in a test's `finally`.

