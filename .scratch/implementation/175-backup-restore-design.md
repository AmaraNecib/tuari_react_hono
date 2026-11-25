# #175 backup restore regression

The test exercises the snapshotter's existing public interface with an isolated temporary SQLite database and synthetic invoice attachment. Its assertion follows the copied snapshot directory into a fresh restore path, reopens the copied database, and verifies the stored attachment path and digest against the restored file's exact bytes and independently computed SHA-256.

Reachable failure: a snapshot can appear complete while losing the database-to-attachment association or storing bytes that do not match the database digest. The test covers that recovery contract without live data, signing, release behavior or warning bypasses.

Review tier: elevated recovery-data test change; retain debate, test-audit and code-review. Verification mode: focused-local / CI-final-pending. Scope: `apps/api/src/modules/backup/backup.snapshot.test.ts` and this design note only. Excludes #625 expense work. Base: `d9510a7ec43986d825139b72d04ecf70253322d6`.
