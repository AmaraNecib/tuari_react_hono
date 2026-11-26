# Local performance measurements

## Debt summary measurement

This is a local baseline for the shared exact-debt aggregate used by the debt summary and dashboard. It does not complete issue #175; keep that issue open.

### Reproduce

From the repository root, restore pinned dependencies with `pnpm install --frozen-lockfile` if needed, build `@tuari/contracts` if its output is absent, then run:

```powershell
pnpm --filter @tuari/api exec tsx scripts/measure-debt-summary.ts
```

The opt-in harness creates a temporary plain (unkeyed) SQLite database. It seeds 1,000 distinct synthetic external counterparties and 1,000 live debt accounts, alternating 500 PAYABLE accounts at 10.01 DZD and 500 RECEIVABLE accounts at 20.02 DZD. Independent expected gross totals are 5,005.00 DZD payable and 10,010.00 DZD receivable. It checks SQL row counts for counterparties, accounts and live entries, then validates summary totals.

The first-call figure measures the first `summary()` invocation after seeding, on the already-open connection. Seeding warms operating-system and SQLite caches; this is not a cold-cache measurement. Five subsequent calls warm the service, followed by 30 measured calls. Result validation runs outside each timed interval. p50/p95 use nearest-rank quantiles: sorted sample at `ceil(p*n)-1`.

### Baseline

Implementation base SHA: `baaca20ef708cdf5dfa31538e609f153254a3fba`. The measured harness source blob was `5cd173391d3380b634826dfe71869dbb3c778c93`.

On Node v22.23.2, Windows x64, Intel64 Family 6 Model 158 Stepping 13, with SQLite 3.51.2: first invocation **110.023 ms**; p50 **85.7061 ms**; p95 **119.7945 ms**; min **78.6454 ms**; max **136.1123 ms**. The dataset contained 1,000 parties, 1,000 accounts and 1,000 live entries; totals were 5,005.00 DZD payable and 10,010.00 DZD receivable.

The harness was later relocated from `apps/api/src/modules/company/measure-debt-summary.ts` to `apps/api/scripts/measure-debt-summary.ts` so this opt-in executable is outside the API source coverage set. The historical JSON and stdout transcript were recovered from the T3 tool transcript at `.scratch/reviews/175-readiness/recovered-run-4/`; the moved harness source was not the source blob measured. They were not saved by the measurement process as runtime logs; native exit metadata and duration were not recorded in that recovered transcript. The worker reported exit 0. The temporary fixture directory printed by the harness was `C:\Users\sensei57\AppData\Local\Temp\tuari-debt-summary-measure-v6bVtL`.

### Scope and limits

This measures `ExactFinanceService.summary()` with `SqliteExactFinanceRepository` against a temporary plain SQLite fixture. It is not full dashboard or network latency, desktop cold start, an encrypted-database build, or realistic all-entity memory usage. It is not a security review or complete #175 acceptance. The proof for merged PR #628 is reused and was not rerun.

## API-only memory observation

On 2026-11-26, the direct Node API process was sampled on Windows 11 Pro build 26300, x64, Node v22.14.0, ABI 127 and SQLite 3.51.2. Product source was pinned to `dd4413845f1a95fa0606d469c1f6705af08cbfd5`. This is a synthetic API observation, not a desktop memory acceptance result.

### Fixture and read sequence

The opt-in seeder uses the real exact application composition and supported services. The fixture contains exactly 1,000 each of employees, projects, external counterparties, catalog definitions and warehouses. All employees are INACTIVE. There are 1,000 payable debt accounts with one live entry each, totalling 10,010.00 DZD. Ten inventory purchases link ten distinct warehouses and definitions, with 20 total units valued at 246.80 DZD. Most roots have no stock transactions; this is not a representative customer workload.

A separate read-only SQL oracle verified those counts, links and exact totals, 9,097 rows across 57 user tables, and zero foreign-key violations before the successful measurement. The API reader signed in through the supported phone/password HTTP endpoint. It checked health, financial metadata, exact debt summary, inventory definitions and invoices, and inventory/debt reports. It validated response contents, not just HTTP status.

### Observed API process memory

Windows `WorkingSet64` and `PrivateMemorySize64` were read for direct API PID 1876. MiB means 1,048,576 bytes.

| Observation | Working set, MiB | Private bytes, MiB |
| --- | ---: | ---: |
| After health | 233.727 | 250.414 |
| After fixed authenticated reads | 247.918 | 264.813 |
| Maximum among recorded samples | 247.918 | 264.813 |

Ten samples span 14:39:34.812 through 14:39:48.085 UTC. Sampling was irregular, with successive intervals from 0.538 to 3.206 seconds. These are snapshots and sampled maxima, not lifetime peaks or Node heap measurements. The script checked the actual API working set against its 1 GiB execution stop, which is a safety cap rather than a product acceptance target.

The successful attempt reused the already-created disposable fixture, including its startup backup. Its last pre-shutdown check recorded 9,062,783 fixture-family bytes and 10,627,119 combined fixture/output bytes, below the 256 MiB safety cap. Resource checks also enforced at least 1.5 GiB free on C:, 2 GiB on D:, and 1 GiB available RAM. The external watchdog enforced a ten-minute admission-inclusive deadline. Enrollment to native completion took 24.071 seconds.

The read client, oracle and controller exited 0. Windows `process.kill(pid, "SIGTERM")` terminated the API with actual native exit 1; this was recorded as controlled Windows termination, not graceful shutdown. The separate outer watchdog exited 0. Native completion and the subsequent tool-return acknowledgement were recorded separately.

### Evidence and limits

The successful attempt is `175-api-memory-resume1`. Its durable metadata, samples and HTTP results are in `D:/temp/tuari-175-api-memory-resume1/meta.json`; the separate outer log and receipt are `D:/temp/tuari-175-api-memory-resume1.outer.jsonl` and `D:/temp/tuari-q21-heavy-watch/receipts/175-api-memory-resume1.json`. These are local evidence paths, not checked-in artifacts.

The fixture was created once in `175-api-memory-run4`. That attempt reached API health but failed before authenticated reads with a missing-file error during its pre-read safety check. The original log lacks the stack needed to prove the exact getter. A separate rename-race experiment exposed a recursive byte-scan failure, and the scanner now retries complete missing-path scans at most three times. The successful continuation reused the fixture instead of reseeding. Earlier preflight failures and all native exits remain preserved locally; none count as successful memory evidence.

Measured harness Git blobs, in seeder/oracle/reader/controller/watchdog order, are `17615c70a3d37b1b4915140562df0478539fe5f8`, `628197bd2afd0a9f630a7ca0aa4d935da17c251e`, `f7140419cac086de28fe13d8086ce60f41f5eadf`, `25adc10442a255ed1c5637ba52fbfad103968bb9` and `70074d31ee23402ac5546117bade034d91e9c663`. Their files live under `apps/api/scripts/`. These are historical measured blobs, not a claim that later harness corrections were remeasured. Review subsequently added distinct nonempty invoice/warehouse identity checks and a fail-closed product-source comparison against the approved revision before fixture and API work. Focused negative checks cover those corrections; no memory workload was replayed. The recorded run checked invoice count, gross and warehouse type, not invoice/warehouse uniqueness. Further hosted-review corrections make cleanup independent of failed cleanup log/metadata writes and check globally distinct stock links, rather than sums of per-purchase distinct counts. Those later checks are not retroactive proof of the historical run.

Under a separate owner-approved exception, attempt `175-contracts-output1` built only contracts from unchanged approved source into fresh D-drive output. Node v22.14.0, tsup 8.5.1 and TypeScript 5.9.3 produced byte-identical `index.js` and `index.d.ts` compared with the existing runtime directory, which was inventoried before and after and left unchanged. SHA256 values are `5570aeef7dad48223cddee8984451ea285214cb5465bffefeb0d8258ff165ff2` for `index.js` and `8737f3c540b7264eac6e04687b59af02c3aae884fa5003e8292adc1b68732741` for `index.d.ts`. The controller now rejects missing, extra or differing output files before fixture work and API startup. This is prospective source-to-output verification, not proof of what ignored output existed during the earlier memory observation. Comparison metadata is local at `D:/temp/tuari-175-contracts-output1/comparison.json`; guard negative checks are at `D:/temp/tuari-175-contracts-guard-check/`.

These Windows scripts are an opt-in operator harness with pinned local Node, checkout and external receipt-tool paths. They are not a portable one-command benchmark. A run requires inspection, fresh resource checks, independent receipt enrollment before `heavy_run`, a unique output directory and an explicit post-tool-return acknowledgement. Do not run the seeder or API directly to bypass the controller.

This observation excludes the desktop shell, webview, separate transpiler child, seeder, reader and controller processes. It uses a plain database and the TypeScript API entrypoint, not a packaged release. It does not establish full-desktop memory, encrypted-build memory, cold-start time, query latency, sustained load or all-domain transaction scale. Issue #175 remains open.
