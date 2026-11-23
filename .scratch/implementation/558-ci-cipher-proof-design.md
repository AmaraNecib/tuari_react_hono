# SQLCipher built-artifact proof fixture

Base: `18b065b1345653166eec74ade50ba9c41b7333fc`. Mode: focused-local / CI-final-pending. Risk: financial database encryption and backup evidence.

The binding-only round-trip uses `roundtrip.sqlite`. The shipped sidecar starts against a separate fresh `data/tuari.sqlite`, so its exact schema gate sees only its own normal startup database. Keep the real daily backup path; require encrypted files, keyed reads, wrong/no-key rejection and backup schema fidelity. The synthetic marker row remains confined to the separate binding probe. Both live and snapshot databases must return the five exact application-owned `exact_money_schema` slice/version rows. These are genuine persisted startup data, not a foreign fixture or an empty-schema comparison. Correct-key reads establish data recovery; wrong-key, missing-key and ordinary SQLite readers must reject actual application-row queries on both files. No startup schema, API, dependency or CI policy changes.

## Diagnosis and module scope

The proof is a process-level adapter over the built CJS entry, copied Node and copied native packages. The binding probe and fresh application database have different ownership. Exported path/freshness and application-row assertions are narrow test interfaces; no production seam moved. Deleting this script would lose shipped-artifact encryption and real daily-backup verification. No domain term changed.

The proof script last changed in `ec0064c7`, before exact-schema startup arrived in `60e38fe6`. Cached `origin/develop` at `82836d09` has the same stale proof script. This is fixture integration drift: pre-startup `CREATE TABLE proof` makes a foreign schema that the exact gate correctly rejects. Do not relax that gate or infer a key regression.

## Verification and chronology

High assurance, focused-local / CI-final-pending. The requested build is necessary because mocks and helper tests cannot establish the bundled native binding, actual startup or daily backup. Import only the retired lane's three source/design drafts; do not claim red-first authorship. Strengthen the draft before executing: it still queried the removed foreign marker in the backup negatives and only checked nonempty schema. Then run actual build and draft proof. Replay the baseline fixture against that same artifact and observe exact-schema refusal before health. Mutate the application path to reuse the written binding file and observe the behavioral regression fail, then restore byte-for-byte. This is draft-first work with retrospective discriminating red proof, not a fabricated red-first sequence.

Use ignored local junctions into the parent's installed dependencies, with a local API node_modules directory and local contracts link/output. No manifest or lock changes; no downloads. Build contracts in this tree before sidecar build. Preserve the output under ignored evidence and restore each tracked placeholder separately.

Focused tests and configured `check:sqlcipher-proof` retain negative readers, cleanup deadlines, plaintext/truncation rejection and native packaging checks. Final proof requires real health readiness, the real daily snapshot, 51 application tables, five persisted slice/version rows in both encrypted files, and all wrong/missing/plain-reader refusals. No browser is involved. Exact commands, failures, durations, artifact hashes and source fingerprints stay in ignored evidence. CI-final acceptance remains pending. Parent owns all three reviews, integration and publication; no worker children, push, PR or merge.
